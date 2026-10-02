# Clio Manage API v4: read-only integration guide (hackathon)

Researched 2026-10-02. Tags: **[V]** verified in official docs this session, **[M]** from memory or secondary source, unverified, **[?]** unknown, test it.
Docs moved: `app.clio.com/api/v4/documentation` 301s to `https://docs.developers.clio.com/clio-manage/api-reference/` (JS-rendered, so the per-endpoint pages were hard to scrape; endpoint-level details marked [M] need a quick check in the reference).

## 1. App registration, OAuth, regions

- Trial: Clio has **no separate sandbox**. A 7-day free Manage trial is the test environment and can be used with the API. It can be converted to a free developer account. The trial must be in the same region as the app. [V, Clio support article]
  - **Trial expires in 7 days. Confirm the Sapini trial is alive through the demo, and cache a snapshot of the data locally in case it lapses.**
- Register the app at `https://developers.clio.com/apps/new`. Fields: name, website URL, redirect URI(s), permissions, optional deauthorize callback URL. You get an App Key (client_id) and App Secret. [V]
- Apps are **per region** (US/CA/EU/AU have different app IDs and credentials). [V]
- Regional hosts [V/M]:
  - US: `https://app.clio.com`
  - CA: `https://ca.app.clio.com`
  - EU: `https://eu.app.clio.com`
  - AU: `https://au.app.clio.com`
  - The API base is `{host}/api/v4`. OAuth endpoints are on the same host (`{host}/oauth/...`) [M for non-US].
- OAuth 2.0 authorization code grant [V]:
  - Authorize: `GET https://app.clio.com/oauth/authorize?response_type=code&client_id=APP_KEY&redirect_uri=http://localhost:3000/callback&state=xyz`
  - Token: `POST https://app.clio.com/oauth/token` (form body: `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, `redirect_uri`).
  - The auth code is valid for 10 minutes [V, secondary].
  - **Access token lifetime: 30 days. Refresh tokens do not expire.** [V] Refresh with `POST /oauth/token` and `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`.
  - Hackathon shortcut: do the flow once by hand and put the access and refresh tokens in `.env`. The 30-day lifetime means you don't need refresh logic for a 6-hour build, but keep the refresh token anyway.
  - Redirect URI must match the registered one exactly. Localhost URIs are fine for dev [M].
  - Deauthorize: `POST /oauth/deauthorize` [V].
- Permissions are OAuth scopes picked in the app config. Two levels per resource: **Read** (GET only) and **Write** (read, create, update, delete). [V] For read-only, tick **Read** on every resource and **never tick Write or Webhooks**. This makes writes impossible at the token level, which is the strongest guard for the read-only rule.
  - Needed (Read): Matters, Contacts, Custom Fields, Notes (under Matters/Contacts), Communications, Tasks, Calendar, Activities (expenses), Documents, Relationships, Users. Bills only if needed.
  - Some endpoints need several scopes (e.g. Matter Clients needs Matters + Contacts). [V] A missing scope gives `403`.
  - Scopes are fixed at authorization time. Adding a scope later means the user must re-authorize. [V]
  - Redacted objects return only `id` plus `redacted: true`. [V] The user's Clio role also limits what is visible. [V]
  - The scope names in the dev portal UI may differ slightly from the above [?].
- Personal Injury add-on API exists (`/api/v4/medical_records_details`, `/damages`, ...). The doc describes only create flows. [V] Whether it has GET index endpoints and whether the trial has the PI add-on [?]. Check if Sapini uses the PI add-on (medical bills, liens, damages), because that data would be only there.

## 2. Resources

General: `GET {base}/api/v4/<resource>.json?...` (the `.json` suffix is optional). All requests use header `Authorization: Bearer <token>`. Optional header `X-API-VERSION: 4.0.x` pins the version [V, seen in the reference].

### `fields=` syntax [V]
- Comma-separated: `fields=id,etag,type`.
- **Default response is minimal (`id` and `etag` only).** You must request every field you want.
- Nested: curly braces, **one level deep only**: `matter{id,description}`. `matter{client{name}}` returns 400.
- An invalid field name returns 400. Not usable on DELETE.

### Matters
- List: `/matters.json?limit=200&fields=id,etag,display_number,description,status,open_date,close_date,pending_date,client{id,name,type},practice_area{id,name},responsible_attorney{id,name},originating_attorney{id,name},matter_stage{id,name},billable,created_at,updated_at,custom_field_values{...}`
- Single: `/matters/{id}.json?fields=...`. Find "Sapini" with `query=Sapini` (searches number/description/client name [M]).
- `status` is a string (Open/Pending/Closed) [M]. Matter filters include `status`, `client_id`, `updated_since`, `ids[]` [M].
- Custom fields on the matter [V]: `/matters/{id}.json?fields=id,display_number,custom_field_values{id,field_name,field_type,value,custom_field}`
  - `custom_field_values` is not returned by default.
  - The value `id` is a composite string (e.g. `text_line-55001`) and can be `null` if the field is shown but has no value.
  - `picklist`, `contact`, and `matter` types return an ID reference in `value`. Request `picklist_option{id,option}` and the like for the label.
  - Narrow with `custom_field_ids[]=55001`.

### Custom field definitions
- `/custom_fields.json?parent_type=matter&fields=id,name,field_type,parent_type,displayed,picklist_options{id,option}` [M for filter and fields]. Use this to map IDs to names and types.

### Contacts
- `/contacts.json?fields=id,name,first_name,last_name,type,primary_email_address,primary_phone_number,email_addresses{address,name,default_email},phone_numbers{number,name},addresses{...},company{id,name},title,date_of_birth,custom_field_values{...}` [M for field names].
- Contacts for a matter: use `/relationships.json?matter_id={id}&fields=id,description,contact{id,name,type}` [V that the endpoint exists, filter [M]], plus `matter.client` on the matter. There is also a Matter Clients endpoint (`/matters/{id}/clients` [M, doc mentions "Matter Clients"]).
- Avatar/photo: **no documented avatar or photo field that I found [?]**. Plan on initials avatars.
- Filters: `query`, `type`, `ids[]`, `updated_since`, `created_since` [M].

### Notes
- `/notes.json?type=Matter&matter_id={id}&fields=id,subject,detail,detail_text_type,date,created_at,updated_at,creator{id,name},matter{id},contact{id}` [M for fields; `type` is required: `Matter` or `Contact`] (also `/matters/{id}/notes` appears in the reference [V]).

### Communications (emails, calls)
- `/communications.json?matter_id={id}&fields=id,subject,body,received_at,type,senders{id,name,type},receivers{id,name,type},matter{id},time_entries{id},updated_at` [M for field names]. Also `date` and `time` on older versions. Filters include `type`, `contact_id`, `updated_since` [M].
- Related: `/conversations.json` and `/conversation_messages.json` exist [V] (the Clio Inbox/threads). **Emails may live in either place [?]. Check both.**
- Attached documents on communications [?].

### Tasks
- `/tasks.json?matter_id={id}&fields=id,name,description,priority,status,due_at,completed_at,assignee{id,name},matter{id},created_at,updated_at` [M]. Filters `status`, `assignee_id`, `due_at_from/to`, `updated_since` [M].

### Calendar entries
- `/calendar_entries.json?matter_id={id}&from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z&fields=id,summary,description,location,start_at,end_at,all_day,matter{id},attendees{id,name,type},calendar_owner{id,name}` [M]. The index probably requires `from` and `to` or defaults to a window. Pass a wide range explicitly [?].

### Expenses (case expenses)
- Expenses are **activities** with `type=ExpenseEntry`: `/activities.json?matter_id={id}&type=ExpenseEntry&fields=id,type,date,quantity,price,total,note,activity_description{id,name},expense_category{id,name},user{id,name},billed,non_billable,matter{id},created_at,updated_at` [V that the endpoint and type exist, filter and fields [M]]. Time entries are `type=TimeEntry`.
- `/expense_categories.json` lists categories [M].

### Documents + download
- Index [V]: `/documents.json?matter_id={id}&fields=id,etag,name,filename,content_type,size,parent{id,type},latest_document_version{id,filename,size,content_type,received_at,fully_uploaded},created_at,updated_at,deleted`. Filters: `matter_id`, `parent_id` (folder), `created_since`, `updated_since`, `ids[]`, `limit` 1-200, `page_token`. Folder tree: `/folders.json?parent_id=...&matter_id=...` [V endpoint, filters [M]].
- `document_versions` as a collection field was **removed from Documents in API 4.0.6** and there is no separate version endpoint in v4. [V, secondary] Use the `latest_document_version` nested field. For historical versions, check the reference [?].
- Download: `GET /documents/{id}/download.json` (optionally `?document_version_id=`). It returns a **303 redirect** to a pre-signed storage URL [V redirect behavior, exact path/param name [M]]. The reference summary I scraped listed it under `GET /documents/{id}.json`, which looks like a scraping artifact. Verify the path in the reference.
  - Redirect gotcha: follow the redirect, but **do not forward the `Authorization` header to the storage host** (S3 rejects a request that has both). In Node `fetch`, set `redirect: 'manual'`, read `Location`, then fetch it with no auth header. [M, standard for signed URLs]. The signed URL expires quickly, so fetch it right away and don't store it.
  - Scanned PDFs: Clio does not OCR for you in the API [M]. The text must come from your own OCR/vision step.
  - Check `fully_uploaded` before downloading [M].

### Relationships
- `/relationships.json?contact_id=` or `?matter_id=` [M]. See Contacts above.

### Bills (if needed)
- `/bills.json?matter_id={id}&fields=id,number,issued_at,due_at,total,balance,state,client{id,name}` [M]. Needs the Bills scope and a billing-capable user role.

### Other
- `/users/who_am_i.json?fields=id,name,email` is a good smoke test for the token. [V endpoint class, M exact path]

## 3. Pagination, rate limits, change detection

- Index limit: **200 per request** by default max (`limit=200`). [V]
- Cursor pagination is the default [V]: follow `meta.paging.next` (a full URL containing `page_token`) until absent. It needs `order=id(asc)` for large sets. Serial only. Offset pagination (`offset=`) is capped at 10,000 records, parallelizable, and not available on every endpoint. [V] The single matter is small, so either works. Just loop on `meta.paging.next`.
- Rate limit [V]: per access token. **50 requests/minute during peak hours** (US/CA Mon-Fri 4-7 PM Pacific, **which includes the 4:00 PM deadline window**; EU 07:00-22:00 GMT; AU 06:00-21:00 AET), higher off-peak. Headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (unix ts). On `429`, honor `Retry-After` (seconds). Limits are not raisable and may change. Individual endpoints may have stricter limits.
  - Implication: **fetch everything once, cache to local JSON/SQLite, and have the dashboard read the cache.** Don't call Clio per page view. Batch with `fields=` and `limit=200`, avoid N+1 per-document metadata calls. Add a small queue with a concurrency of 2-3.
- Change detection: `updated_since=2026-10-02T12:00:00Z` (ISO 8601) on most indexes [V on documents, M elsewhere]. `order=updated_at(desc)` [M]. Offset pagination permits custom orders.
- ETags [V]: each record has `etag`. `If-None-Match: <etag>` or `If-Modified-Since` returns `304` when unchanged (documented for single-resource fetches). `If-Match` is for PATCH only, which you won't use.

## 4. Webhooks (RISKY under read-only rule)

- They exist: `POST /api/v4/webhooks` with `url` (HTTPS), `model`, `events` (created/updated/deleted), `fields`, `expires_at`, `shared_secret`. [V] Models include matter, contact, document, communication, task, calendar_entry, activity, bill, folder. Needs the **Webhooks scope** plus each model's scope. Default expiry is 3 days (max 31); renew with PATCH. Clio sends a handshake POST with `X-Hook-Secret`. Signatures use HMAC-SHA256 in `X-Hook-Signature`. [V]
- **Creating one is a POST that creates a resource in the Clio account.** It is not case data, but it is a write to the account, and it requires the Write-level Webhooks scope that the read-only rule says not to grant. **Don't use it.** Also it needs a public HTTPS endpoint, which is impractical on localhost. Use polling with `updated_since` (every 60 s is about 10 req/min across resources, fine).

## 5. Gotchas

- Default responses carry only `id` and `etag`. Always set `fields=`. Nested fields are one level only. Custom fields and many associations are opt-in.
- Dates: ISO 8601. Datetimes are UTC with offset (`2026-10-02T14:30:00+00:00`). Pure dates are `YYYY-MM-DD` (e.g. `date`, `open_date`, `due_at` may be either, so parse defensively). Filters like `updated_since` take ISO 8601 datetimes. [M]
- Money in expenses: `price`, `total` are numbers, not cents. [M]
- A `403` usually means a missing scope or a user role restriction. [V] Redacted records have `redacted: true`. [V]
- Responses are wrapped: `{ "data": [...], "meta": { "paging": {...}, "records": N } }`. Single resource: `{ "data": {...} }`. [V/M]
- 303 redirect on downloads. See Documents.
- Access token 30 days. Refresh tokens do not expire. Store both in `.env` (gitignored).
- Use the right region host. A token from one region doesn't work on another.
- Trial lasts 7 days. See Section 1.
- Docs site is a JS app and some pages 404 for scrapers (`/api-docs/documents/` 404s). The working base is `https://docs.developers.clio.com/api-docs/clio-manage/...`.

## 6. SDKs

- **No official Node or Python SDK** that I could find. The old Ruby gem is unsupported. Community: `DocketAlarm/clio-python-client` (small, unclear maintenance). Clio's own `clio/example-third-party-application` (Ruby/Rails) is a useful OAuth reference. [V]
- Recommendation: **plain `fetch`** with a thin wrapper that (a) is GET-only (throws on any other method, which enforces the read-only rule in code), (b) follows `meta.paging.next`, (c) respects `Retry-After`, (d) caches to disk.

## 7. Could not verify

- Exact download endpoint path and parameter names, and `document_version` retrieval for old versions.
- Exact per-resource field names and filter params marked [M] (communications, calendar_entries `from`/`to` requirement, activities `type` filter, tasks).
- Whether emails are in `communications` or `conversation_messages`.
- Whether contacts have any avatar field.
- Whether the trial includes the PI add-on and if its entities have GET endpoints.
- Exact scope labels in the developer portal UI.
- Per-endpoint rate limits.

Recommended first step: with the token, call `/users/who_am_i.json`, then `/matters.json?query=Sapini&fields=id,display_number,description`, then explore each resource with `limit=1` and a broad `fields=` list. Invalid field names return 400 naming the bad field, so errors are self-documenting.

Sources: docs.developers.clio.com (`/api-docs/clio-manage/{authorization,applications,permissions,fields,paging,rate-limits,etags}/`, `/guides/clio-manage/{custom-fields,webhooks,personal-injury-api}/`, `/clio-manage/api-reference/`, `/handbook/getting-started/get-a-developer-account/`), Clio support articles, github.com/clio/example-third-party-application.
