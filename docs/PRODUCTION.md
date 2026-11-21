# PRODUCTION.md

Operational guidance for running LendLoop in production.

---

## Product Evolution & Scaling

### Location & Geospatial Search

Geolocation and radius math were intentionally omitted from this MVP under the assumption of a closed community (e.g., HOA or apartment building). For a city-wide V2 scale, the architecture would evolve to store geospatial coordinates (lat/long) on users and tools and utilize bounding-box filtering on the `listAll` query to enforce a search radius.

### Omnichannel Notifications

While the current MVP uses email/Slack webhooks as requested, a real-world hyperlocal peer-to-peer app would experience much less friction using SMS or WhatsApp Business API. In a future iteration, the `users` table would be expanded to capture `phoneNumber` and `notificationPreference` to route outbox events to mobile messaging platforms.
