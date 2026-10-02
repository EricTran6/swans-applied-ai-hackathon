#!/usr/bin/env python3
"""GET-only Clio dump of the Sapini matter into .cache/clio/. Stdlib only."""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".cache", "clio")
MATTER_ID, CLIENT_ID = 1811202578, 2437351988
DROPPED = []  # (resource, field, reason)


def load_env():
    env = {}
    with open(os.path.join(ROOT, ".env")) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
BASE = ENV["CLIO_BASE_URL"].rstrip("/")
if not BASE.endswith("/api/v4"):
    BASE += "/api/v4"
TOKEN = ENV["CLIO_ACCESS_TOKEN"]
HOST = urllib.parse.urlparse(BASE).netloc


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def _get(url, auth=True, tries=6):
    """The ONLY network primitive: HTTP GET. Returns (status, headers, body bytes)."""
    host = urllib.parse.urlparse(url).netloc
    if auth and host != HOST:
        raise RuntimeError("refusing to send auth to foreign host")
    for _ in range(tries):
        req = urllib.request.Request(url, method="GET")
        if auth:
            req.add_header("Authorization", "Bearer " + TOKEN)
        req.add_header("Accept", "application/json")
        try:
            r = OPENER.open(req, timeout=120)
            status, hdrs, body = r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            status, hdrs, body = e.code, e.headers, e.read()
        if status == 429:
            wait = float(hdrs.get("Retry-After") or 30)
            print(f"  429, sleeping {wait}s", file=sys.stderr)
            time.sleep(wait + 1)
            continue
        rem = hdrs.get("X-RateLimit-Remaining")
        if auth and rem is not None and int(rem) <= 2:
            reset = hdrs.get("X-RateLimit-Reset")
            wait = max(1, int(reset) - int(time.time()) + 1) if reset else 60
            wait = min(wait, 65)
            print(f"  rate limit low, sleeping {wait}s", file=sys.stderr)
            time.sleep(wait)
        return status, hdrs, body
    raise RuntimeError("too many 429s")


def build_url(path, params, fields):
    q = [(k, str(v)) for k, v in params.items()]
    q += [("fields", ",".join(fields))]
    return f"{BASE}/{path}?" + urllib.parse.urlencode(q, safe="{},")


def fetch_all(name, path, params, fields, single=False):
    """Fetch with field list; on 400 drop the offending field and retry. Follows paging."""
    fields = list(fields)
    while True:
        url = build_url(path, {**params, **({} if single else {"limit": 200})}, fields)
        status, _, body = _get(url)
        if status == 200:
            break
        msg = body.decode("utf-8", "replace")[:500]
        if status == 400 and fields:
            try:
                emsg = json.loads(body)["error"]["message"]
            except Exception:
                emsg = msg
            bad = [x.strip() for x in re.split(r"\s+(?:is not a valid field|are not valid fields)", emsg)[0].split(",")]
            changed = False
            for b in bad:
                m = re.match(r"^(\w+)\{(\w+)\}$", b)
                if re.match(r"^\w+\{\}$", b):
                    b = b[:-2]  # nested sub-field invalid
                if m:
                    for i, f in enumerate(fields):
                        if f.startswith(m.group(1) + "{"):
                            inner = [x for x in f[len(m.group(1)) + 1:-1].split(",") if x != m.group(2)]
                            fields[i] = m.group(1) + "{" + ",".join(inner) + "}"
                            changed = True
                    DROPPED.append((name, b, "nested sub-field invalid"))
                    continue
                key = b.rstrip("}")
                hit = [f for f in fields if f.split("{")[0] == key]
                for f in hit:
                    fields.remove(f)
                    DROPPED.append((name, f, emsg[:120]))
                    changed = True
            if not changed:
                print(f"[{name}] 400 unparseable: {msg}", file=sys.stderr)
                DROPPED.append((name, "(whole request)", msg))
                return None
            continue
        print(f"[{name}] HTTP {status}: {msg}", file=sys.stderr)
        DROPPED.append((name, "(whole request)", f"HTTP {status}: {msg[:200]}"))
        return None
    payload = json.loads(body)
    if single:
        return payload["data"]
    data = list(payload["data"])
    nxt = payload.get("meta", {}).get("paging", {}).get("next")
    while nxt:
        status, _, body = _get(nxt)
        if status != 200:
            print(f"[{name}] paging HTTP {status}", file=sys.stderr)
            break
        p = json.loads(body)
        data += p["data"]
        nxt = p.get("meta", {}).get("paging", {}).get("next")
    return data


def save(name, obj):
    with open(os.path.join(OUT, name + ".json"), "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    n = len(obj) if isinstance(obj, list) else 1
    print(f"saved {name}: {n}")


CF = "custom_field_values{id,field_name,field_type,value,custom_field}"
MATTER_F = ["id", "etag", "display_number", "description", "status", "open_date", "close_date",
            "pending_date", "billable", "location", "client_reference", "maildrop_address",
            "created_at", "updated_at", "client_id",
            "client{id,name,type,first_name,last_name}", "contact{id,name}",
            "practice_area{id,name}", "responsible_attorney{id,name}",
            "originating_attorney{id,name}", "responsible_staff{id,name}",
            "matter_stage{id,name}", "statute_of_limitations{id,due_at,status}",
            "group{id,name}", "billing_method", "custom_rate{id}", "account_balances{id}",
            "folder{id,name}", CF]
CONTACT_F = ["id", "etag", "name", "first_name", "last_name", "middle_name", "prefix", "suffix",
             "title", "type", "date_of_birth", "initials", "primary_email_address",
             "primary_phone_number", "primary_web_site", "company{id,name}", "image_url",
             "avatar", "photo", "image", "email_addresses{id,address,name,default_email}",
             "phone_numbers{id,number,name,default_number}",
             "addresses{id,name,street,city,province,postal_code,country,primary}",
             "web_sites{id,address,name}", "instant_messengers{id,address,name}",
             "created_at", "updated_at", "is_client", "clio_connect_email",
             "currency{id,code}", "notes{id}", CF]
REL_F = ["id", "description", "created_at", "updated_at", "contact{id,name,type}",
         "matter{id,display_number}"]
NOTE_F = ["id", "etag", "subject", "detail", "detail_text_type", "date", "created_at", "updated_at",
          "creator{id,name}", "regarding{id,type,display_number,name}", "matter{id}", "contact{id}",
          "time_entries{id}", "notes_attachments{id}"]
COMM_F = ["id", "etag", "subject", "body", "type", "date", "time", "received_at", "created_at",
          "updated_at", "external_properties{id,name,value}", "senders{id,name,type,email_address}",
          "receivers{id,name,type,email_address}", "matter{id,display_number}",
          "user{id,name}", "has_attachments", "time_entries{id}", "documents{id,name}",
          "conversation_id", "message_type", "attachment_count"]
TASK_F = ["id", "etag", "name", "description", "priority", "status", "statute_of_limitations",
          "due_at", "completed_at", "reminders{id}", "assignee{id,name,type}", "assigner{id,name}",
          "matter{id,display_number}", "task_type{id,name}", "created_at", "updated_at", "permission"]
CAL_F = ["id", "etag", "summary", "description", "location", "start_at", "end_at", "all_day",
         "recurrence_rule", "calendar_entry_event_type{id,name}", "calendar_owner{id,name}",
         "matter{id,display_number}", "attendees{id,name,type,email}", "created_at", "updated_at",
         "reminders{id}", "external_properties{id}", "permission", "send_email_notification"]
EXP_F = ["id", "etag", "type", "date", "quantity", "price", "total", "note", "contingency_fee",
         "billed", "non_billable", "non_billable_total", "activity_description{id,name}",
         "expense_category{id,name}", "user{id,name}", "matter{id,display_number}",
         "vendor{id,name}", "created_at", "updated_at", "reference", "bill{id}"]
DOC_F = ["id", "etag", "name", "type", "filename", "content_type", "size", "document_category{id,name}",
         "parent{id,type,name}", "matter{id}", "creator{id,name}", "received_at", "created_at",
         "updated_at", "deleted", "locked", "latest_document_version{id,filename,size,content_type,"
         "received_at,fully_uploaded,created_at,uuid}"]
FOLDER_F = ["id", "name", "type", "parent{id,type}", "matter{id}", "created_at", "updated_at"]
CONV_F = ["id", "subject", "message_count", "read", "archived", "matter{id}", "created_at",
          "updated_at", "last_message_at", "contacts{id,name}", "messages{id}"]
CMSG_F = ["id", "subject", "body", "type", "sent_at", "received_at", "created_at", "updated_at",
          "sender{id,name}", "to{id,name}", "cc{id,name}", "bcc{id,name}", "conversation{id}",
          "matter{id}", "has_attachments", "attachments{id,name}"]


def main():
    os.makedirs(os.path.join(OUT, "documents"), exist_ok=True)
    only = set(sys.argv[1:])
    run = lambda n: not only or n in only

    if run("matter"):
        save("matter", fetch_all("matter", f"matters/{MATTER_ID}.json", {}, MATTER_F, single=True))
    if run("custom_fields"):
        save("custom_fields", fetch_all("custom_fields", "custom_fields.json", {"parent_type": "matter"},
             ["id", "name", "field_type", "parent_type", "displayed", "required",
              "picklist_options{id,option}"]) or [])
    if run("contacts"):
        save("client_contact", fetch_all("client_contact", f"contacts/{CLIENT_ID}.json", {}, CONTACT_F, single=True))
        rels = fetch_all("relationships", "relationships.json", {"matter_id": MATTER_ID}, REL_F) or []
        save("relationships", rels)
        crels = fetch_all("client_relationships", "relationships.json", {"contact_id": CLIENT_ID}, REL_F) or []
        save("client_relationships", crels)
        ids = sorted({r["contact"]["id"] for r in rels + crels if r.get("contact")} - {CLIENT_ID})
        related = []
        for cid in ids:
            c = fetch_all(f"contact_{cid}", f"contacts/{cid}.json", {}, CONTACT_F, single=True)
            if c:
                related.append(c)
        save("related_contacts", related)
    if run("notes"):
        save("notes", fetch_all("notes", "notes.json", {"type": "Matter", "matter_id": MATTER_ID}, NOTE_F) or [])
        save("client_notes", fetch_all("client_notes", "notes.json", {"type": "Contact", "contact_id": CLIENT_ID}, NOTE_F) or [])
    if run("communications"):
        save("communications", fetch_all("communications", "communications.json", {"matter_id": MATTER_ID}, COMM_F) or [])
        save("conversations", fetch_all("conversations", "conversations.json", {"matter_id": MATTER_ID}, CONV_F) or [])
        save("conversation_messages", fetch_all("conversation_messages", "conversation_messages.json",
             {"matter_id": MATTER_ID}, CMSG_F) or [])
    if run("tasks"):
        save("tasks", fetch_all("tasks", "tasks.json", {"matter_id": MATTER_ID}, TASK_F) or [])
    if run("calendar"):
        save("calendar_entries", fetch_all("calendar_entries", "calendar_entries.json",
             {"matter_id": MATTER_ID, "from": "2000-01-01T00:00:00Z", "to": "2040-01-01T00:00:00Z"}, CAL_F) or [])
    if run("expenses"):
        save("expenses", fetch_all("expenses", "activities.json", {"matter_id": MATTER_ID, "type": "ExpenseEntry"}, EXP_F) or [])
    if run("documents"):
        docs = fetch_all("documents", "documents.json", {"matter_id": MATTER_ID}, DOC_F) or []
        save("documents", docs)
        save("folders", fetch_all("folders", "folders.json", {"matter_id": MATTER_ID}, FOLDER_F) or [])
        for d in docs:
            v = d.get("latest_document_version") or {}
            if d.get("type") == "Folder" or not v:
                continue
            fn = re.sub(r"[^\w.\- ]", "_", d.get("filename") or d.get("name") or str(d["id"]))
            dest = os.path.join(OUT, "documents", f"{d['id']}_{fn}")
            if os.path.exists(dest):
                continue
            status, hdrs, body = _get(f"{BASE}/documents/{d['id']}/download.json")
            if status in (301, 302, 303, 307) and hdrs.get("Location"):
                status, hdrs, body = _get(hdrs["Location"], auth=False)  # no Authorization to signed URL
            if status == 200:
                with open(dest, "wb") as f:
                    f.write(body)
                print(f"downloaded {dest} ({len(body)} bytes)")
            else:
                DROPPED.append((f"download {d['id']}", "(file)", f"HTTP {status}"))
                print(f"download {d['id']} failed HTTP {status}", file=sys.stderr)
    save("_dropped_fields", [list(x) for x in DROPPED])


if __name__ == "__main__":
    main()
