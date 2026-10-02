"""Generate SYNTHETIC fixtures (fake client, fake providers) that mirror the raw Clio v4 shapes
written by scripts/clio_dump.py, including the real-data gotchas:
  - every created_at/updated_at is the same seed timestamp (do not use for change detection)
  - HTML entities in note text (&amp; &#39; &quot;)
  - provider medical bills stored as expense activities with total=null, amount in non_billable_total
  - client-initiated phone calls logged with sender = firm User, receiver = client
  - statute-of-limitations task complete with a past due date
  - an earlier note contradicted by a later one (self-insured vs limits confirmed)
Dev/test only. Runtime code never imports fixtures/. Run: python3 fixtures/make_fixtures.py
"""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "clio")
SEED = "2026-10-02T10:00:00-07:00"
MID, CID, UID = 900001, 800001, 700001
USER = {"id": UID, "name": "Alex Counsel", "type": "User"}
CLIENT = {"id": CID, "name": "Jane Doe", "type": "Person"}
M = {"id": MID, "display_number": "00042-Doe"}
n = iter(range(100000, 999999))


def base(**kw):
    return {"id": next(n), "etag": f'"{next(n):x}e7a"', "created_at": SEED, "updated_at": SEED, **kw}


def contact(cid, name, typ="Person", **kw):
    first, _, last = name.partition(" ")
    return {"id": cid, "etag": f'"{cid:x}c0"', "name": name, "first_name": first if typ == "Person" else None,
            "last_name": last if typ == "Person" else None, "middle_name": None, "prefix": None, "title": None,
            "type": typ, "date_of_birth": None, "initials": "".join(w[0] for w in name.split()[:2]).upper(),
            "primary_email_address": None, "primary_phone_number": None, "primary_web_site": None, "company": None,
            "avatar": None, "email_addresses": [], "phone_numbers": [], "addresses": [], "web_sites": [],
            "instant_messengers": [], "created_at": SEED, "updated_at": SEED, "is_client": False,
            "clio_connect_email": None, "currency": None, "custom_field_values": [], **kw}


PROVIDERS = [  # (id, name, role)
    (810001, "Riverside Physical Therapy", "Treating provider, physical therapy"),
    (810002, "Lakeview Orthopaedics PLLC", "Treating provider, orthopaedic surgery"),
    (810003, "Harbor Chiropractic", "Treating provider, chiropractic"),
]
OTHERS = [
    (820001, "Robert Smith", "Person", "Adverse driver"),
    (820002, "Acme Delivery Corp", "Company", "Adverse party, vehicle owner (self-insured)"),
    (820003, "Claims Service Group", "Company", "Third-party administrator and adjuster"),
    (820004, "Safeway Mutual Insurance", "Company", "Client no-fault insurer"),
]

client = contact(CID, "Jane Doe", is_client=True, title="Ms.", date_of_birth="1990-03-14", initials="JD",
                 primary_email_address="jane.doe@example.test", primary_phone_number="(555) 010-2000")
related = [contact(i, nm, "Company") for i, nm, _ in PROVIDERS] + [contact(i, nm, t) for i, nm, t, _ in OTHERS]
relationships = [base(description=r, contact={"id": i, "name": nm, "type": "Company"}, matter=M) for i, nm, r in PROVIDERS] + \
                [base(description=r, contact={"id": i, "name": nm, "type": t}, matter=M) for i, nm, t, r in OTHERS]

CF = [  # (field id, name, type, value)
    (30001, "Date of Incident", "date", "2024-03-10"),
    (30002, "Accident Location", "text_line", "Main St & 2nd Ave, Springfield"),
    (30003, "Insurance Carrier", "text_line", "SELF-INSURED (Acme Delivery Corp); TPA Claims Service Group"),
    (30004, "Claim Number", "text_line", "CSG-000123"),
    (30005, "Case Summary", "text_area", "Rear-ended at a red light by a delivery van. Left shoulder surgery; right knee recommended."),
    (30006, "Policy Limits", "text_area", "Defendant liability $250,000/$500,000; client UM/UIM $50,000/$100,000; no-fault $50,000"),
    (30007, "Policy Limits Confirmed", "checkbox", True),
    (30008, "Estimated Case Value", "currency", 600000),
    (30009, "Case Value Rationale", "text_area", "Surgery plus second surgery recommended; capped by the liability limit."),
    (30010, "Medical Specials To Date", "currency", 41250),
    (30011, "Wage Loss Claimed", "text_line", "$38,000"),
    (30012, "Liability Assessment", "text_area", "Clear liability on the rear-end; defense disputes causation."),
    (30013, "Treatment Status", "text_line", "Active: PT twice weekly"),
    (30014, "Health Insurance or Lien Holder", "text_line", "State Medicaid lien $9,400"),
    (30015, "Prior Related Injuries", "text_area", "Prior right knee sprain 2019, resolved."),
    (30016, "HIPAA Authorization Received", "checkbox", True),
]
custom_fields = [{"id": i, "name": nm, "field_type": t, "parent_type": "Matter", "displayed": True, "required": False} for i, nm, t, _ in CF]
matter = {
    "id": MID, "etag": '"m42e7a"', "display_number": "00042-Doe",
    "description": "Doe, Jane - MVA (Main St & 2nd Ave, Springfield)", "status": "Open", "open_date": "2024-03-15",
    "close_date": None, "pending_date": None, "billable": True, "location": None, "client_reference": None,
    "maildrop_address": None, "created_at": SEED, "updated_at": SEED, "client_id": CID,
    "client": {"id": CID, "name": "Jane Doe", "type": "Person", "first_name": "Jane", "last_name": "Doe"},
    "practice_area": {"id": 1, "name": "Personal Injury"}, "responsible_attorney": {"id": UID, "name": "Alex Counsel"},
    "originating_attorney": {"id": UID, "name": "Alex Counsel"}, "responsible_staff": None,
    "matter_stage": {"id": 5, "name": "Litigation"},
    "statute_of_limitations": {"id": 1, "due_at": "2027-03-10", "status": "complete"},
    "group": None, "billing_method": "contingency", "account_balances": [], "folder": {"id": 50000, "name": "00042-Doe"},
    "custom_field_values": [{"id": f"{t}-{i}", "field_name": nm, "field_type": t, "value": v, "custom_field": {"id": i}} for i, nm, t, v in CF],
}

notes = [base(subject=s, detail=d, detail_text_type="plain_text", date=dt, matter={"id": MID}, contact=None, time_entries=[]) for s, d, dt in [
    ("Intake summary", "Met Jane Doe. Rear-ended at a red light on Main St &amp; 2nd Ave. ER next day: neck and left shoulder pain. She&#39;s treating at Riverside Physical Therapy.", "2024-03-15"),
    ("Insurance", "Acme Delivery Corp is self-insured; no declared limit. Adjuster at Claims Service Group.", "2024-03-20"),
    ("Post-op", "Left shoulder arthroscopy performed 2024-06-04 by Lakeview Orthopaedics (DOI + 86). Recovery on track.", "2024-06-10"),
    ("Specials tally", "Specials to date $41,250: Riverside PT $12,000; Lakeview Orthopaedics $26,500; Harbor Chiropractic $2,750. Ledgers unreconciled.", "2025-01-12"),
    ("Medicaid lien", "State Medicaid asserted a lien of $9,400. Will negotiate at the end.", "2025-02-02"),
    ("Case evaluation", "Value estimate $600,000. Recovery capped by the $250,000 liability limit. Do not share with providers.", "2026-06-01"),
    ("Coverage", "Adjuster confirmed in writing: liability limits $250,000/$500,000. Supersedes the self-insured note.", "2026-09-05"),
    ("Case posture", "Read before the next conference. Liability: rear-end, clear. Causation disputed by the IME. Open: right knee surgery still undated after 4 requests to Lakeview; Riverside ledger not updated since 2025-01. Settlement strategy: hold for limits.", "2026-09-20"),
]]

def comm(subject, body, typ, date, senders, receivers):
    return base(subject=subject, body=body, type=typ, date=date, received_at=None, external_properties=[],
                senders=senders, receivers=receivers, matter=M, user={"id": UID, "name": "Alex Counsel"}, time_entries=[], documents=[])

LAKE = {"id": 810002, "name": "Lakeview Orthopaedics PLLC", "type": "Company"}
RIVER = {"id": 810001, "name": "Riverside Physical Therapy", "type": "Company"}
communications = [
    comm("Photos of paperwork", "Attached are photos of the exchange of information sheet. Jane", "EmailCommunication", "2024-03-16", [CLIENT], [USER]),
    comm("Records request", "Please send updated records and the surgical date for the right knee.", "EmailCommunication", "2026-07-01", [USER], [LAKE]),
    comm("RE: Records request", "Second request: updated records and the right knee surgical date.", "EmailCommunication", "2026-08-01", [USER], [LAKE]),
    comm("RE: Records request", "Third request for the right knee surgical date.", "EmailCommunication", "2026-09-01", [USER], [LAKE]),
    comm("Ledger request", "Please send an itemized ledger for services after January 2025.", "EmailCommunication", "2026-09-10", [USER], [RIVER]),
    comm("Call with client", "Jane called: asked whether to keep PT twice weekly; still out of work.", "PhoneCommunication", "2026-09-28", [USER], [CLIENT]),
    comm("Status update", "Wrote to Jane with the conference date; no reply yet.", "EmailCommunication", "2026-09-22", [USER], [CLIENT]),
    comm("Adjuster", "Limits confirmed at $250,000/$500,000.", "EmailCommunication", "2026-09-04", [{"id": 820003, "name": "Claims Service Group", "type": "Company"}], [USER]),
]

def task(name, desc, status, due, sol=False, completed=None):
    return base(name=name, description=desc, priority="normal", status=status, statute_of_limitations=sol, due_at=due,
                completed_at=completed, reminders=[], assignee=USER, assigner={"id": UID, "name": "Alex Counsel"},
                matter=M, task_type=None, permission="owner")

tasks = [
    task("Limitations Date", "Statute of limitations. Satisfied: suit commenced within time.", "complete", "2026-03-01", True, SEED),
    task("By medical provider: Lakeview Orthopaedics PLLC - records and right knee surgical date", "4 requests so far.", "pending", "2026-08-30"),
    task("By client: employment records", "Client to send pay stubs.", "pending", "2026-09-28"),
    task("By medical provider: Riverside Physical Therapy - itemized ledger", "Ledger since Jan 2025.", "pending", "2026-10-09"),
    task("Prepare for compliance conference", "", "pending", "2026-10-20"),
    task("Request ER records", "", "complete", "2024-04-01", False, SEED),
]

def cal(summary, start, desc=""):
    return {"id": str(next(n)), "etag": '"c1"', "summary": summary, "description": desc, "location": None, "start_at": start,
            "end_at": None, "all_day": True, "recurrence_rule": None, "calendar_entry_event_type": None,
            "calendar_owner": {"id": UID, "name": "Alex Counsel"}, "matter": M, "attendees": [], "created_at": SEED,
            "updated_at": SEED, "reminders": [], "external_properties": [], "permission": "owner"}

calendar_entries = [
    cal("Initial consultation, Jane Doe", "2024-03-15T09:00:00-07:00"),
    cal("Left shoulder arthroscopy (Lakeview Orthopaedics)", "2024-06-04T08:00:00-07:00"),
    cal("Suit filed", "2025-03-01T09:00:00-07:00"),
    cal("Client treatment: Riverside PT", "2026-10-06T10:00:00-07:00"),
    cal("Compliance conference", "2026-10-21T09:30:00-07:00"),
]

def exp(date, total, nbt, note):
    return base(type="ExpenseEntry", date=date, quantity=1.0, price=total, total=total, note=note, contingency_fee=False,
                billed=False, non_billable=nbt is not None, non_billable_total=nbt, activity_description=None,
                expense_category=None, user={"id": UID, "name": "Alex Counsel"}, matter=M, bill=None)

expenses = [
    exp("2024-04-02", 75.0, None, "Records reproduction: ER chart. Case expense."),
    exp("2025-03-01", 210.0, None, "Court filing fee: index number."),
    exp("2026-05-10", 450.0, None, "IME observer fee."),
    exp("2025-01-10", None, 12000.0, "Medical treatment charges - DEMO. Bill: 05-medical-bills__riverside-physical-therapy-bill.pdf (services through 2025-01-08)"),
    exp("2024-07-01", None, 26500.0, "Medical treatment charges - DEMO. Bill: 05-medical-bills__lakeview-orthopaedics-bill.pdf"),
    exp("2024-12-01", None, 2750.0, "Medical treatment charges - DEMO. Bill: 05-medical-bills__harbor-chiropractic-bill.pdf"),
]

FOLDERS = {"01": (51001, "01 Intake"), "02": (51002, "02 Pleadings"), "04": (51004, "04 Medical Records"), "05": (51005, "05 Medical Bills")}
folders = [{"id": 50000, "name": "00042-Doe", "type": "Folder", "parent": None, "matter": {"id": MID}, "created_at": SEED, "updated_at": SEED}] + \
          [{"id": fid, "name": nm, "type": "Folder", "parent": {"id": 50000, "type": "Folder"}, "matter": {"id": MID}, "created_at": SEED, "updated_at": SEED} for fid, nm in FOLDERS.values()]

def doc(fname, folder, received, size=4000):
    fid, fnm = FOLDERS[folder]
    did = next(n)
    return {"id": did, "etag": '"d1"', "name": fname, "type": "Document", "filename": fname, "content_type": "application/pdf",
            "size": size, "document_category": None, "parent": {"id": fid, "type": "Folder", "name": fnm}, "matter": {"id": MID},
            "creator": {"id": UID, "name": "Alex Counsel"}, "received_at": received, "created_at": SEED, "updated_at": SEED,
            "locked": False, "latest_document_version": {"id": did + 1, "filename": fname, "size": size, "content_type": "application/pdf",
            "received_at": received, "fully_uploaded": True, "created_at": SEED, "uuid": f"uuid-{did}"}}

documents = [
    doc("01-intake__hipaa-authorization.pdf", "01", "2024-03-15T00:00:00-07:00"),
    doc("02-pleadings__bill-of-particulars.pdf", "02", "2025-06-01T00:00:00-07:00"),
    doc("04-medical-records__riverside-physical-therapy-records.pdf", "04", "2025-01-15T00:00:00-07:00"),
    doc("05-medical-bills__riverside-physical-therapy-bill.pdf", "05", "2025-01-10T00:00:00-07:00"),
]

os.makedirs(OUT, exist_ok=True)
for name, data in {"matter": matter, "custom_fields": custom_fields, "client_contact": client, "relationships": relationships,
                   "client_relationships": [], "related_contacts": related, "notes": notes, "client_notes": [],
                   "communications": communications, "conversations": [], "conversation_messages": [], "tasks": tasks,
                   "calendar_entries": calendar_entries, "expenses": expenses, "documents": documents, "folders": folders}.items():
    with open(os.path.join(OUT, f"{name}.json"), "w") as f:
        json.dump(data, f, indent=1)


# ---------- minimal text PDF (stdlib only): ALL-CAPS hard-wrapped pleading text like a real Bill of Particulars ----------
def write_pdf(path, pages):
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for lines in pages:
        stream = "BT /F1 10 Tf 50 750 Td 14 TL " + " ".join(f"({l}) Tj T*" for l in lines) + " ET"
        objs.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {len(objs)} 0 R >>")
        kids.append(len(objs))
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>"
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out.encode("latin-1")))
        out += f"{i} 0 obj\n{o}\nendobj\n"
    x = len(out.encode("latin-1"))
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offs)
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n"
    with open(path, "w", encoding="latin-1") as f:
        f.write(out)

docs_dir = os.path.join(os.path.dirname(__file__), "documents")
os.makedirs(docs_dir, exist_ok=True)
write_pdf(os.path.join(docs_dir, "bill-of-particulars-sample.pdf"), [
    ["SUPREME COURT OF THE STATE OF EXAMPLE", "VERIFIED BILL OF PARTICULARS", "PLAINTIFF JANE DOE", "1 of 3"],
    ["9. THE INJURIES SUSTAINED BY PLAINTIFF ARE AS FOLLOWS:", "LEFT SHOULDER:", "TEAR OF THE ANTERIOR SUPERIOR",
     "LABRUM; SYNOVITIS; NECESSITATING LEFT SHOULDER", "ARTHROSCOPIC SURGERY PERFORMED ON JUNE 4, 2024.", "2 of 3"],
    ["RIGHT KNEE:", "TEAR OF THE MEDIAL MENISCUS; NECESSITY FOR", "RIGHT KNEE ARTHROSCOPIC SURGERY.", "CERVICAL SPINE: DISC BULGE AT C5-C6.", "3 of 3"],
])
print("fixtures written to", OUT, "and", docs_dir)
