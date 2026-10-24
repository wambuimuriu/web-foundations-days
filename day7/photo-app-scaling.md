# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

| Assumption | Value |
|---|---|
| Registered users | 10,000,000 |
| Daily active users (DAU) | 10% of registered users |
| Uploads per active user per day | 1 photo |
| Feed pages viewed per active user per day | 50 |
| Average original photo size | 2 MB |
| Thumbnail size | 50 KB (one per photo) |
| Seconds in a day (estimate) | 100,000 (the real figure is 86,400) |
| Peak traffic | 5x the average |
| Days in a year | 365 |

**Daily active users:** 10,000,000 x 10% = **1,000,000 DAU**.

## 2. Estimates

### Uploads per second

- Uploads per day: 1,000,000 users x 1 photo = 1,000,000 uploads/day
- Average: 1,000,000 / 100,000 = **10 uploads/second**
- Peak (5x): **50 uploads/second**

### Feed views per second

- Feed views per day: 1,000,000 users x 50 pages = 50,000,000 views/day
- Average: 50,000,000 / 100,000 = **500 feed views/second**
- Peak (5x): **2,500 feed views/second**

### Storage per year

- Originals per day: 1,000,000 x 2 MB = 2,000,000 MB = 2 TB/day
- Thumbnails per day: 1,000,000 x 50 KB = 50,000,000 KB = 50 GB/day
- Total per day: about 2.05 TB
- Originals per year: 2 TB x 365 = **730 TB**
- Thumbnails per year: 50 GB x 365 = **about 18 TB**
- Total photo storage per year: **about 750 TB (roughly 0.75 PB)**

Database rows (users, follows, photo metadata, likes) are tiny by comparison. One million new photo rows a day at about 1 KB each is roughly 1 GB/day, or about 365 GB/year.

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. On average there are 500 feed views per second against 10 uploads per second, a ratio of about **50 reads for every write**. Each feed page also shows many photos, so the number of image fetches is higher still.

What this means for the design:

- Serve images from a **CDN** so most photo traffic never reaches our servers.
- Put a **cache** in front of the database for feeds and hot data.
- Add a **read replica** so the primary database only has to handle writes and a few critical reads.
- Keep writes simple and safe. They are rarer, so they can go through the primary database and a queue without becoming a bottleneck.

## 4. Why photos do not belong in the database

At about 750 TB per year, photos would bloat the database to a size that is slow and very expensive to back up, replicate and restore. Databases are built for small, structured, queryable rows, not large binary blobs. Every photo read would also use up database connections and memory that queries need.

Photos belong in **object storage** (such as Amazon S3 or Google Cloud Storage). It is cheap per TB, scales almost without limit, replicates data across locations, and works well with a CDN. The database stores only the **metadata** and a pointer: the photo id, owner id, caption, timestamp, and the object storage key or URL of the original and the thumbnail.

## 5. Architecture diagram

```
                          +-----------+
                          |   Users   |
                          | (phones,  |
                          | browsers) |
                          +-----+-----+
                                |
              +-----------------+------------------+
              | images (GET)                        | API calls (feed, upload)
              v                                     v
        +-----------+                      +----------------+
        |    CDN    |                      | Load Balancer  |
        +-----+-----+                      +--------+-------+
              | cache miss                          |
              v                          +----------+----------+
     +------------------+                |          |          |
     |  Object Storage  |           +----v---+ +----v---+ +----v---+
     | (originals and   |<----------+  App   | |  App   | |  App   |
     |   thumbnails)    |  upload   | Server | | Server | | Server |
     +--------+---------+           +--+--+--+ +---+----+ +---+----+
              ^                        |  |        |          |
              |                        |  |  (stateless: any server can serve any request)
              |                        |  |
              |                        |  +-----------------------+
              |                        |                          |
              |                  +-----v------+            +------v------+
              |                  |   Cache    |            |    Queue    |
              |                  |  (Redis)   |            |  (thumbnail |
              |                  +-----+------+            |    jobs)    |
              |                        | miss              +------+------+
              |                        v                          |
              |                 +--------------+                  v
              |   thumbnail     |   Primary    |           +-------------+
              +-----------------+   Database   |           |   Worker(s) |
              |  saved here     |   (writes)   |           |  make 50 KB |
              |                 +------+-------+           |  thumbnails |
              |                        | replication       +------+------+
              |                        v                          |
              |                 +--------------+                  |
              |                 | Read Replica |                  |
              |                 |   (reads)    |                  |
              |                 +--------------+                  |
              +---------------------------------------------------+
                  worker reads original, writes thumbnail,
                  then updates the photo row in the database
```

In short: image requests go to the CDN, which fetches from object storage on a miss. API requests go through the load balancer to the app servers. Feed reads check the cache first, then the read replica. Writes go to the primary database. New uploads are saved to object storage, and a queue hands thumbnail work to background workers.

## 6. Components, one sentence each

- **CDN:** Serves photos from servers close to users, which cuts latency and keeps most image traffic off our own servers.
- **Load balancer:** Spreads incoming requests across many app servers so no single server is overloaded and one failure doesn't take the app down.
- **App servers:** Run the application logic (login, upload, feed) and are stateless, so we can add or remove them to match traffic.
- **Cache (Redis):** Keeps hot data such as recently built feeds in memory, so repeated feed requests avoid slow database queries.
- **Primary database:** Is the source of truth for users, follows and photo metadata, and handles all writes consistently.
- **Read replica:** Holds a copy of the primary and serves read queries, so the heavy read traffic does not slow down writes.
- **Object storage:** Stores the large photo files cheaply and durably at petabyte scale, which a database cannot do well.
- **Queue:** Holds thumbnail jobs so uploads can finish immediately and work is not lost if workers are busy or down.
- **Worker:** Takes jobs from the queue, creates the 50 KB thumbnail in the background, and can be scaled independently of the web servers.

## 7. Upload flow, step by step

1. The user picks a photo in the app and taps upload. The request goes to the CDN or load balancer endpoint, which forwards it to a healthy app server.
2. The app server checks the user's login session (held in a shared store, not in server memory) and validates the file (type and size limit).
3. The app server saves the original 2 MB file to **object storage** and gets back a storage key.
4. The app server inserts a row in the **primary database** with the photo id, owner id, caption, timestamp, the original's storage key, and the status `processing`.
5. The app server puts a "create thumbnail" job (with the photo id and storage key) on the **queue**.
6. The app server responds to the user with success right away. The user does not wait for the thumbnail.
7. A **worker** takes the job from the queue, reads the original from object storage, and creates a 50 KB thumbnail.
8. The worker saves the thumbnail to object storage and updates the photo's database row with the thumbnail key and status `ready`. If it fails, the job is retried.
9. The app invalidates the cached feeds of affected users (the uploader and, depending on the design, their followers), so the next feed read loads fresh data.
10. When followers open their feed, they get the photo's thumbnail and image URLs, and the browser downloads them from the **CDN**.

## 8. Trade-offs

1. **Cache speed vs freshness.** Caching feeds makes reads very fast, but cached data can be stale, so a new photo might not show up immediately. We can invalidate on upload or use short expiry times, at the cost of more complexity and a few more database reads.
2. **Read replica speed vs consistency.** Replicas let us scale reads, but replication has a small delay (replica lag), so a user might not see their own new photo for a moment if their feed is read from a replica. One fix is to read the user's own recent activity from the primary, which adds a little load and code complexity.
3. **Async thumbnails: fast uploads vs delay.** The queue and worker make uploads fast and resilient, but the thumbnail is not ready instantly, so the app must handle a `processing` state (for example by showing a placeholder). The system is also more complex, with more moving parts to monitor.
4. **Cost of CDN and storage.** A CDN and about 750 TB of new storage per year cost money, but the alternative is a much slower app and overloaded servers. We can reduce cost by compressing images, moving old photos to cheaper storage tiers, and setting good cache lifetimes.
5. **Feed building: fan-out on write vs read.** Precomputing each follower's feed when a photo is uploaded makes reading very fast, but one upload by a user with millions of followers means millions of writes. Building the feed when it is requested avoids that, but makes each read slower and heavier. A mix (precompute for normal users, compute on read for very popular accounts) is common.
