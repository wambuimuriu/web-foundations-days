# Reflection

**What was the most difficult concept, and how did I overcome it?**
The hardest concept for me was understanding how caching, read replicas and the primary database fit together, especially keeping cached data fresh. At first I thought a cache simply made everything faster. Then I learned that a cached note list can be out of date after an edit, so the server has to invalidate it. I overcame this by working through the numbers by hand (for example, 4 million reads a day is about 40 per second) and by drawing the request flow step by step for GET and POST. Seeing which component answers each request made the idea clear.

**Which part of my capstone would I improve?**
The feedback on my QuickNotes project made me realise my design documents explain the normal case well but say little about what happens when something fails. I would add a section on failure handling and monitoring, and show the request flows as sequence diagrams. In the API client, I would also store created notes properly instead of only updating the page, and add automatic tests for the error states.

**What will I learn next?**
I want to build a real backend instead of using a practice API. Next I will learn Node.js with Express, connect it to a PostgreSQL database, and add login with secure password hashing and tokens. After that I want to learn how to deploy an app online and how to test it under load, so I can see for myself whether a design like TicketHub survives a big sale.
