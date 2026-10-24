# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. Most days it is quiet, but when a popular concert goes on sale, a huge crowd arrives at once and fights for a small number of seats. The design has to be correct on both kinds of day.

This document follows the six-part framework: requirements, estimates, API, data model, architecture and trade-offs. Section 5 explains how two people are prevented from buying the same seat.

## 1. Requirements

### Functional requirements

- Visitors can browse and search upcoming events and view event details.
- Users can register, log in and log out.
- Users can view the seat map for an event and see which seats are available.
- Users can **hold** one or more seats for a short time (5 minutes) while they pay.
- Users can pay for held seats and receive their tickets (with a unique code or QR code) by email and in the app.
- Users can view their orders and tickets.
- A hold that is not paid for expires automatically and the seats become available again.
- Admins can create events and set seats and prices.

### Non-functional requirements

- **Speed:** browsing pages respond in under 300 ms on a normal day. During a big sale the seat map and hold requests should still respond in about 1 second.
- **Correctness:** a seat is never sold to two people, a user is never charged without receiving tickets, and a payment is never taken twice for the same order. This matters more than speed.
- **Fairness:** during a big sale, people are served in a fair order, and one person (or bot) cannot grab hundreds of seats. We set a limit of 4 tickets per user per event and use a waiting room.
- **Availability:** the site stays up during the sale (99.9%). If part of the system fails, buyers must not lose held seats or paid orders.
- **Scalability:** handle about 650 times the normal request rate for 10 to 15 minutes without crashing.
- **Security:** HTTPS everywhere, hashed passwords, card details handled only by the payment provider (never stored by us), and protection against bots.
- **Durability:** every paid order and ticket is stored safely and backed up.

## 2. Estimates

### Assumptions

| Assumption | Value |
|---|---|
| Registered users | 2,000,000 |
| Visitors on a normal day | 50,000, each viewing 10 pages |
| Tickets sold on a normal day | 5,000 |
| Big sale | 200,000 people try to buy 20,000 seats in the first 10 minutes (600 seconds) |
| Requests per person during a big sale | about 10 (load page, view seat map a few times, hold, pay) |
| Hold attempts per person during a big sale | about 3 |
| Seconds in a day (estimate) | 100,000 |
| Peak traffic | 5x the average |

### Normal day

- **Page views:** 50,000 x 10 = 500,000 per day, and 500,000 / 100,000 = **5 page views/second on average, 25 at peak.**
- **Ticket sales:** 5,000 per day / 100,000 = **0.05 tickets/second** (one ticket every 20 seconds), and about 0.25/second at peak.
- **Storage:** about 5,000 x 365 = 1.8 million tickets per year at roughly 0.5 KB each (order, ticket and seat updates), so **about 1 GB per year**. The 2 million user rows add about 1 GB. Storage is not a problem.

A normal day is tiny. A single small server and one database could handle it.

### Big sale (20,000 seats, 200,000 people, 10 minutes)

- **Arrivals:** 200,000 / 600 seconds = about **333 new people/second on average**. In reality most arrive in the first minute, so the real figure at the start is closer to 100,000 / 60 = **1,700 people/second**.
- **Requests:** 200,000 x 10 = 2,000,000 requests in 600 seconds, which is **about 3,300 requests/second on average, and up to about 16,000/second at peak (5x)**.
- **Hold attempts:** 200,000 x 3 = 600,000 in 600 seconds, which is **about 1,000/second on average and 5,000/second at peak**, all aimed at the same 20,000 rows.
- **Sales:** at most 20,000 tickets in 600 seconds = **at most about 33 sales/second on average** (limited by the number of seats), with payments arriving in bursts of perhaps 150/second.
- **Demand vs supply:** 200,000 / 20,000 = **10 people for every seat**, so 90% of the people will go away without a ticket. Most of the load comes from people who will not succeed.

### Comparison

| | Normal day | Big sale | Difference |
|---|---|---|---|
| Requests per second (average) | 5 | about 3,300 | about 650x |
| Requests per second (peak) | 25 | about 16,000 | about 650x |
| Tickets sold per second | 0.05 | about 33 | about 650x |
| Writes competing for the same rows | almost none | about 1,000 to 5,000 hold attempts/second on 20,000 seats | the main danger |

**What this means:** the system is read-heavy most of the time (browsing), but during a sale it becomes both read-heavy (everyone refreshes the seat map) and write-contended (everyone tries to hold the same seats). The spike lasts only 10 to 15 minutes, so we do not want to pay for a huge permanent system. We design for elastic capacity (extra servers added just before the sale) plus a waiting room that limits how many people reach the database at once.

## 3. API

Base URL: `https://api.tickethub.example/v1`. All requests and responses use JSON. Every endpoint except browsing and login needs `Authorization: Bearer <token>`.

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | POST | `/auth/login` | Log in and receive a token | 200 OK |
| 2 | GET | `/events` | Browse and search events (`?q=`, `?city=`, `?from=`, `?limit=`, `?cursor=`) | 200 OK |
| 3 | GET | `/events/{id}` | Event details (name, venue, date, on-sale time) | 200 OK |
| 4 | GET | `/events/{id}/seats` | Seat map with each seat's status (available, held, sold) and price | 200 OK |
| 5 | POST | `/events/{id}/queue` | Join the waiting room for a popular sale and get a place in line | 202 Accepted |
| 6 | POST | `/events/{id}/holds` | Hold one or more seats for 5 minutes | 201 Created |
| 7 | DELETE | `/holds/{hold_id}` | Release held seats early | 204 No Content |
| 8 | POST | `/orders` | Pay for a hold and create the order and tickets | 201 Created |
| 9 | GET | `/orders/{id}` | View one order | 200 OK |
| 10 | GET | `/me/tickets` | View all of my tickets | 200 OK |

### Example: hold seats

`POST /events/17/holds`

```json
{ "seat_ids": [4821, 4822] }
```

Response: `201 Created`

```json
{
  "hold_id": "b3f1c9de-5a0e-4c35-9d0b-6a1d2f7c8e41",
  "event_id": 17,
  "seat_ids": [4821, 4822],
  "total_cents": 18000,
  "expires_at": "2026-12-05T18:05:00Z"
}
```

If any requested seat is already taken, **none** are held and the response is `409 Conflict`:

```json
{
  "error": {
    "code": "seat_unavailable",
    "message": "One or more of the seats you chose are no longer available.",
    "unavailable_seat_ids": [4822]
  }
}
```

### Example: pay for a hold

`POST /orders` with the header `Idempotency-Key: 7d2e...` (a unique value the client generates for this purchase)

```json
{ "hold_id": "b3f1c9de-5a0e-4c35-9d0b-6a1d2f7c8e41", "payment_token": "tok_abc123" }
```

Response: `201 Created`

```json
{
  "order_id": 90412,
  "status": "paid",
  "total_cents": 18000,
  "tickets": [
    { "ticket_id": 55001, "seat_id": 4821, "code": "TH-9F2K-71QA" },
    { "ticket_id": 55002, "seat_id": 4822, "code": "TH-3M8D-20ZB" }
  ]
}
```

### Error codes

| Status | When |
|--------|------|
| 400 | Invalid request (for example more than 4 seats, or an empty seat list) |
| 401 | Not logged in, or token expired |
| 402 | Payment was declined (the hold is kept until it expires so the user can try another card) |
| 403 | Not allowed (for example reading someone else's order) |
| 404 | Event, seat, hold or order does not exist |
| 409 | A seat is already held or sold |
| 410 | The hold has expired |
| 429 | Too many requests (rate limit) or the waiting room is not letting you in yet |
| 500 | Unexpected server error |

The `Idempotency-Key` header means that if the user's phone retries `POST /orders` after a timeout, the server returns the original result instead of charging again.

## 4. Data model

### Tables

**users** `(id PK, email UNIQUE, password_hash, name, created_at)`

**events** `(id PK, name, venue, city, starts_at, on_sale_at, status)`

**seats** `(id PK, event_id FK, section, row_label, seat_number, price_cents, status, hold_id, held_by FK, held_until)`: one row per physical seat **per event**. `status` is `available`, `held` or `sold`.

**orders** `(id PK, user_id FK, event_id FK, status, total_cents, payment_ref, idempotency_key UNIQUE, created_at)`: `status` is `pending`, `paid`, `failed` or `refunded`.

**tickets** `(id PK, order_id FK, seat_id FK UNIQUE, ticket_code UNIQUE)`: one row per ticket sold.

### Relationships

- **users to orders is one-to-many:** one user can place many orders, but each order belongs to one user.
- **events to seats is one-to-many:** an event has thousands of seats, and each seat row belongs to one event.
- **orders to tickets is one-to-many:** an order can contain several tickets, but each ticket belongs to one order.
- **seats to tickets is one-to-one:** a seat can be sold at most once, so at most one ticket exists for it. This is enforced by `UNIQUE (seat_id)` in `tickets`.
- **users to seats (holds):** `seats.held_by` records which user currently holds a seat. Many seats can be held by the same user, but a seat is held by at most one user.
- **users to events is many-to-many through orders:** a user can buy tickets for many events, and an event has many buyers. The `orders` table (with `event_id`) is the link, and `tickets` records the exact seats.

### CREATE TABLE statements (PostgreSQL)

```sql
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  venue      TEXT NOT NULL,
  city       TEXT NOT NULL,
  starts_at  TIMESTAMPTZ NOT NULL,
  on_sale_at TIMESTAMPTZ NOT NULL,
  status     TEXT NOT NULL DEFAULT 'scheduled'
);

CREATE TABLE seats (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    BIGINT NOT NULL REFERENCES events(id),
  section     TEXT NOT NULL,
  row_label   TEXT NOT NULL,
  seat_number INT  NOT NULL,
  price_cents INT  NOT NULL CHECK (price_cents >= 0),
  status      TEXT NOT NULL DEFAULT 'available'
              CHECK (status IN ('available', 'held', 'sold')),
  hold_id     UUID,
  held_by     BIGINT REFERENCES users(id),
  held_until  TIMESTAMPTZ,
  UNIQUE (event_id, section, row_label, seat_number),
  CHECK (status <> 'held' OR (held_by IS NOT NULL AND held_until IS NOT NULL))
);

CREATE TABLE orders (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  event_id        BIGINT NOT NULL REFERENCES events(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  total_cents     INT NOT NULL CHECK (total_cents >= 0),
  payment_ref     TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id),
  seat_id     BIGINT NOT NULL UNIQUE REFERENCES seats(id),  -- a seat can be sold only once
  ticket_code TEXT NOT NULL UNIQUE
);
```

### Indexes

```sql
CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_seats_expired_holds ON seats (held_until) WHERE status = 'held';
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX idx_tickets_order ON tickets (order_id);
```

- `seats (event_id, status)` makes the seat map and "how many seats are left" queries fast.
- The partial index on `held_until` lets the cleanup worker find expired holds quickly without scanning all 20,000 seats.
- `orders (user_id, created_at DESC)` serves "my orders" for each user.

### SQL or NoSQL?

I choose **SQL (PostgreSQL)**. The most important rule of the system is correctness of seat ownership, and a relational database gives us the tools for it: transactions, row locks, `CHECK` constraints and `UNIQUE` constraints. Money and tickets are strongly related data (user, order, ticket, seat) that must change together or not at all, which is what transactions guarantee. The load, at most a few thousand writes per second on a small set of rows, is well within what a single well-tuned primary can do, so we do not need NoSQL's ability to spread writes over many nodes, and we would lose the constraints that protect us.

## 5. How the design prevents two people buying the same seat

We use several layers, so that a bug or a race in one layer is still caught by the next. The database, not the cache and not the application code, makes the final decision.

**Layer 1: an atomic "hold" using a conditional UPDATE inside a transaction.**

```sql
BEGIN;

UPDATE seats
SET status = 'held',
    hold_id = :hold_id,
    held_by = :user_id,
    held_until = now() + interval '5 minutes'
WHERE event_id = :event_id
  AND id = ANY(:seat_ids)
  AND (status = 'available'
       OR (status = 'held' AND held_until < now()));   -- expired holds can be taken

-- If the number of rows updated is less than the number of seats requested:
--   ROLLBACK and return 409 Conflict (no partial holds).
-- Otherwise:
COMMIT;
```

The check ("is it available?") and the change ("mark it held") happen in **one statement**, so there is no gap between checking and changing in which another buyer could slip in. When two people run this for the same seat at the same moment, the database locks that row for the first transaction; the second waits, then re-checks the `WHERE` condition after the first commits, sees the seat is now `held` and not expired, and updates **0 rows**. The second person gets `409`. To avoid deadlocks when buyers pick overlapping seats, the application always sorts `seat_ids` in ascending order before updating.

**Layer 2: the purchase is another transaction that re-checks ownership.**

```sql
BEGIN;

-- Lock the seats and check that this user still holds them and the hold has not expired
SELECT id FROM seats
WHERE hold_id = :hold_id AND held_by = :user_id
  AND status = 'held' AND held_until > now()
FOR UPDATE;

-- If the count is wrong: ROLLBACK and return 410 Gone

UPDATE seats SET status = 'sold', held_until = NULL WHERE hold_id = :hold_id;
INSERT INTO tickets (order_id, seat_id, ticket_code) ...;
UPDATE orders SET status = 'paid' WHERE id = :order_id;

COMMIT;
```

Marking the seats sold, creating the tickets and marking the order paid happen together. Either all succeed or none do.

**Layer 3: constraints are the safety net.** Even if the code above had a bug, `tickets.seat_id` is `UNIQUE`, so the database refuses to create a second ticket for the same seat, and the transaction fails and rolls back. The `CHECK` constraints also stop a seat from being "held" without an owner and an expiry time.

**Layer 4: holds expire, and payment is safe.**
- A hold lasts 5 minutes. A background worker releases expired holds every few seconds, and the hold query itself also treats expired holds as available, so even if the worker is late nobody is blocked.
- When the user starts paying, the hold is extended by 2 minutes so that a slow payment does not expire halfway through.
- The `Idempotency-Key` (unique per order) stops a retry from charging twice. If a payment succeeds but the hold had already expired and the seat was sold to someone else, the system automatically refunds the payment rather than selling the seat twice.

**Layer 5: caches are only for display.** The seat map shown in the browser comes from a cache or CDN and may be a second or two old. So a user may click a seat that has just gone. That is fine, because the hold request goes to the database, which says `409`, and the app shows "Sorry, that seat was just taken. Please choose another." The cache is never trusted to decide whether a seat can be sold.

**Optional speed-up:** a fast check in Redis (`SET seat:17:4821 <user> NX EX 300`) can reject most obvious losers before they reach the database. The database transaction above remains the final authority.

**Fairness:** a limit of 4 seats per user per event, rate limiting, and the waiting room (below) stop bots and people with fast connections from taking everything.

## 6. Architecture

```
 Client (browser / mobile app)
        |
        v
 DNS  (www.tickethub.example -> CDN,  api.tickethub.example -> load balancer)
        |
        +--------------------------+
        |                          |
        v                          v
   CDN + bot protection       Load Balancer (2+ instances, health checks)
   (HTML, JS, CSS, images,           |
    cached event pages and           v
    cached seat map, 2 s)     Waiting Room (virtual queue)
                              admits e.g. 2,000 people at a time
                                     |
                       +-------------+-------------+
                       |             |             |
                       v             v             v
                 App Server 1   App Server 2   App Server N   (stateless,
                       |             |             |           autoscaled)
        +--------------+-------------+-------------+-----------------+
        |                            |                               |
        v                            v                               v
   Cache (Redis)             Primary Database ---replication--> Read Replica(s)
   seat map, event pages,    (seat holds, orders,                (browse, search,
   queue positions,          tickets: ALL writes)                my tickets)
   rate limits, sessions
                                     |
   App servers also:                 |
   - call the Payment Provider (external, card data never touches us)
   - put jobs on the Queue

   Queue ---> Workers ---> send ticket emails / PDFs, release expired holds,
                           handle payment webhooks and refunds
```

### Components, one sentence each

- **Client:** The browser or app shows events and the seat map and sends requests, so users never touch our servers directly.
- **DNS:** Translates our names into the right addresses, so we can change infrastructure without users noticing.
- **CDN and bot protection:** Serves static files, images and briefly cached pages from servers near the user and blocks obvious bots, so most of the crowd's traffic never reaches our servers.
- **Load balancer:** Spreads requests over many app servers and skips unhealthy ones, so no single server is overloaded and one failure does not stop the sale.
- **Waiting room:** Lets only a limited number of people into the buying stage at a time and puts the rest in a fair queue, so the database is not hit by 200,000 people at once.
- **App servers:** Run the API logic (validation, holds, orders) and hold no state, so we can add many more just before a big sale.
- **Cache (Redis):** Keeps the seat map, event pages, queue positions and rate-limit counters in memory, so repeated reads do not reach the database.
- **Primary database:** Is the single source of truth for seats, holds, orders and tickets, and its transactions and constraints prevent double booking.
- **Read replicas:** Answer browsing, search and "my tickets" reads, so these never compete with the busy seat updates on the primary.
- **Payment provider:** A third-party service that takes card payments, so we never store card details and do not have to build payment security ourselves.
- **Queue:** Holds background jobs such as emails and refunds, so the purchase response is fast and no job is lost if workers are busy.
- **Workers:** Process queue jobs and release expired holds, so slow tasks never delay buyers.

### How a purchase flows

1. At the on-sale time, the user opens the event page (served from the CDN) and joins the **waiting room** (`POST /events/{id}/queue`). Users who join in the first few minutes get a random place in line, not a first-click advantage.
2. When their turn comes, they receive a short-lived token that lets them into the buying stage.
3. The browser loads the **seat map** (`GET /events/{id}/seats`), which comes from the cache or CDN and refreshes every few seconds.
4. The user picks up to 4 seats and the app calls `POST /events/{id}/holds`. The database transaction in section 5 holds the seats atomically, or returns `409` if any is taken.
5. The user pays. The app calls `POST /orders` with the idempotency key; the app server charges the payment provider, then runs the purchase transaction that marks the seats sold and creates the tickets.
6. The app responds with the tickets, and puts a job on the **queue** to email them.
7. If the user abandons the page, the hold expires after 5 minutes and the seats go back on sale for the next person.

### How the design survives the big sale

- **The waiting room protects the database.** Only a few thousand people are in the buying stage at a time, so hold requests drop from a possible 5,000 per second to a few hundred, which one primary database handles comfortably. The other 190,000 people are waiting and only polling their queue position, which is cheap.
- **The CDN and cache absorb the reads.** If 3,000 active buyers refresh the seat map every 5 seconds, that is 600 requests/second, all served from a cache that is refreshed every 1 to 2 seconds. Nobody queries the database for the seat map directly.
- **Servers scale out ahead of time.** The sale time is known in advance, so we add app servers and warm the cache before it starts. Because servers are stateless, any of them can serve any request.
- **Writes stay simple.** Only holds, purchases and expiry touch the primary, and each is a small transaction on a handful of rows.
- **Slow work is moved off the main path.** Emails, PDFs and refunds go through the queue.
- **Graceful degradation.** If we are under extreme load we can switch off search and recommendations to keep the purchase path working.
- **Failure handling.** If an app server dies, the load balancer stops sending it traffic and the user retries; their hold survives because it lives in the database, not in the server's memory. If the primary fails, a replica is promoted. If the queue or workers are down, tickets are already safe in the database and emails are sent once workers recover.

## 7. Trade-offs

1. **Waiting room: fairness and stability vs user experience.** The waiting room keeps the system alive and treats everyone fairly, but users must wait and some will give up or be frustrated. Giving a random place to everyone who joins early is fairer than "first to click", but some people will feel it is arbitrary.
2. **Cached seat map: speed vs freshness.** A cached seat map can handle enormous traffic, but it can be 1 to 2 seconds old, so users will sometimes pick a seat that is already gone and get a `409`. We accept that because the database makes the final decision, and we show a friendly message and refresh the map. A shorter cache time shows fresher data but costs more load.
3. **Hold duration: giving buyers time vs keeping seats available.** A longer hold (say 10 minutes) is kinder to slow payers, but abandoned holds keep seats unavailable and make the event look sold out when it is not. A short hold (5 minutes, extended while paying) frees seats faster but puts users under pressure.
4. **One primary database: simple and correct vs limited write scaling.** Keeping all seat writes in one primary database makes correctness easy (one place decides) but all writes go through a single machine. That is fine for our estimate of a few hundred to a few thousand writes per second. If TicketHub had several huge sales at the same time we could shard by `event_id`, so each event's seats live on one database, at the cost of more complexity.
5. **Strong consistency vs availability.** If the primary database is unreachable, we stop selling rather than risk selling the same seat twice. This lowers availability for a short time, but a wrongly sold seat (an angry customer, a refund and a damaged reputation) costs more than a short pause.
