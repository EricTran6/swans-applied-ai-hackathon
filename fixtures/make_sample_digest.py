"""Synthetic sample Digest + ProviderView (fake client) so UI streams can build before the pipeline exists. Dev only."""
import json, os
D = os.path.dirname(__file__)
def ref(value, st, cid, date, quote=None, page=None, deriv="stated"):
    r = {"value": value, "sourceType": st, "clioId": str(cid), "sourceDate": date, "quote": quote,
         "drawerKey": f"{st}:{cid}" + (f"#p{page}" if page else ""), "derivation": deriv if quote else "clio-metadata", "quoteVerified": bool(quote)}
    if page: r["page"] = page
    return r
N_POST = ref("2024-06-04", "note", 100003, "2024-06-10", "Left shoulder arthroscopy performed 2024-06-04")
N_POSTURE = ref("Case posture", "note", 100008, "2026-09-20", "right knee surgery still undated after 4 requests to Lakeview")
N_COV = ref("$250,000/$500,000", "note", 100007, "2026-09-05", "liability limits $250,000/$500,000")
N_LIEN = ref("$9,400", "note", 100005, "2025-02-02", "lien of $9,400")
CF_VAL = ref("$600,000", "custom_field", "currency-30008", None)
CALL = ref("2026-09-28", "communication", 100030, "2026-09-28", "Jane called: asked whether to keep PT twice weekly")
BOP2 = ref("Left shoulder labral tear", "document", 100060, "2025-06-01", "TEAR OF THE ANTERIOR SUPERIOR LABRUM", 2)
BOP3 = ref("Right knee meniscus tear", "document", 100060, "2025-06-01", "TEAR OF THE MEDIAL MENISCUS", 3)
T_LAKE = ref("2026-08-30", "task", 100040, "2026-08-30")
T_EMP = ref("2026-09-28", "task", 100041, "2026-09-28")
T_RIV = ref("2026-10-09", "task", 100042, "2026-10-09")
C_CONF = ref("2026-10-21", "calendar_entry", 100050, "2026-10-21")
EXP = ref("$735", "expense", 100070, "2026-05-10")
digest = {
 "matterId": "900001", "version": 3, "createdAt": "2026-10-02T11:00:00Z", "inputSetHash": "sample",
 "header": {"clientName": "Jane Doe", "clientInitials": "JD", "displayNumber": "00042-Doe",
   "description": "Doe, Jane - MVA (Main St & 2nd Ave, Springfield)", "status": "Open", "matterUrl": "https://app.clio.com/nc/#/matters/900001",
   "incidentDate": ref("2024-03-10", "custom_field", "date-30001", None),
   "sol": {"date": "2026-03-01", "status": "satisfied", "refs": [ref("Satisfied", "task", 100039, "2026-03-01")]}},
 "client": {"name": "Jane Doe", "initials": "JD", "age": 36, "avatarUrl": None,
   "lastContact": {"date": "2026-09-28", "kind": "Phone", "daysAgo": 4, "summary": "Asked whether to keep PT twice weekly", "ref": CALL},
   "nextTouchpoint": {"date": "2026-10-06", "title": "Client treatment: Riverside PT", "ref": ref("2026-10-06", "calendar_entry", 100049, "2026-10-06")},
   "statusChips": [{"text": "Treating twice weekly", "refs": [CALL]}, {"text": "Out of work", "refs": [CALL]}]},
 "brief": [
   {"text": "Jane Doe was rear-ended on 2024-03-10 and had left shoulder surgery on 2024-06-04.", "refs": [N_POST]},
   {"text": "Liability limits of $250,000/$500,000 were confirmed in writing on 2026-09-05, superseding the earlier self-insured note.", "refs": [N_COV]},
   {"text": "The biggest open item: right knee surgery is still undated after 4 requests to Lakeview Orthopaedics.", "refs": [N_POSTURE]},
   {"text": "State Medicaid holds a $9,400 lien.", "refs": [N_LIEN]}],
 "kpis": [
   {"key": "case_value", "label": "Case value", "display": "$600,000 est. · capped at $250,000", "value": 600000, "unit": "usd",
    "range": {"low": 250000, "high": 600000, "cap": 250000}, "status": "warn", "asOf": "2026-10-02", "refs": [CF_VAL, N_COV], "computedBy": "code"},
   {"key": "coverage", "label": "Coverage", "display": "$250,000 BI · confirmed", "value": 250000, "unit": "usd", "status": "ok", "asOf": "2026-10-02",
    "refs": [N_COV], "conflicts": [ref("self-insured", "note", 100002, "2024-03-20", "Acme Delivery Corp is self-insured")], "computedBy": "code"},
   {"key": "firm_spend", "label": "Firm spend", "display": "$735", "value": 735, "unit": "usd", "status": "ok", "asOf": "2026-10-02", "refs": [EXP], "computedBy": "code"},
   {"key": "last_client_contact", "label": "Last client contact", "display": "4 days ago (call)", "value": 4, "unit": "days", "status": "ok", "asOf": "2026-10-02", "refs": [CALL], "computedBy": "code"},
   {"key": "next_deadline", "label": "Next deadline", "display": "Oct 9 · Riverside ledger", "value": None, "unit": "date", "status": "warn", "asOf": "2026-10-02", "refs": [T_RIV], "computedBy": "code"},
   {"key": "specials", "label": "Medical specials", "display": "$41,250", "value": 41250, "unit": "usd", "status": "ok", "asOf": "2026-10-02", "refs": [ref("$41,250", "custom_field", "currency-30010", None)], "computedBy": "code"}],
 "coverage": [
   {"kind": "BI", "perPerson": 250000, "perAccident": 500000, "carrier": "Claims Service Group", "refs": [N_COV]},
   {"kind": "UM/UIM", "perPerson": 50000, "perAccident": 100000, "carrier": None, "refs": [ref("UM/UIM", "custom_field", "text_area-30006", None)]},
   {"kind": "No-fault/PIP", "perPerson": 50000, "perAccident": None, "carrier": "Safeway Mutual Insurance", "exhausted": True, "refs": [ref("no-fault", "custom_field", "text_area-30006", None)]}],
 "valueWaterfall": [
   {"label": "Liability limit", "amount": 250000, "kind": "start", "refs": [N_COV]},
   {"label": "Medicaid lien", "amount": -9400, "kind": "minus", "refs": [N_LIEN]},
   {"label": "Firm costs", "amount": -735, "kind": "minus", "refs": [EXP]},
   {"label": "Before attorney fees", "amount": 239865, "kind": "result", "refs": []}],
 "providerBills": [
   {"providerContactId": "810002", "providerName": "Lakeview Orthopaedics PLLC", "amount": 26500, "servicesThrough": None, "refs": [ref("$26,500", "expense", 100071, "2024-07-01")]},
   {"providerContactId": "810001", "providerName": "Riverside Physical Therapy", "amount": 12000, "servicesThrough": "2025-01-08", "refs": [ref("$12,000", "expense", 100072, "2025-01-10")]},
   {"providerContactId": "810003", "providerName": "Harbor Chiropractic", "amount": 2750, "servicesThrough": None, "refs": [ref("$2,750", "expense", 100073, "2024-12-01")]}],
 "topTen": [
   {"rank": 1, "score": 0.94, "title": "Case posture", "why": "Self-labelled summary: knee surgery undated, ledger stale, causation disputed", "category": "litigation", "date": "2026-09-20", "ref": N_POSTURE},
   {"rank": 2, "score": 0.9, "title": "Coverage confirmed", "why": "Limits confirmed in writing; supersedes self-insured note", "category": "insurance", "date": "2026-09-05", "ref": N_COV},
   {"rank": 3, "score": 0.81, "title": "Call with client", "why": "Most recent client contact", "category": "client", "date": "2026-09-28", "ref": CALL},
   {"rank": 4, "score": 0.7, "title": "Medicaid lien", "why": "Comes off the top of any recovery", "category": "money", "date": "2025-02-02", "ref": N_LIEN},
   {"rank": 5, "score": 0.66, "title": "Post-op", "why": "Anchor event: left shoulder surgery", "category": "medical", "date": "2024-06-10", "ref": N_POST}],
 "totalItems": 37,
 "actionBoard": {
   "overdue": [{"id": "task:100040", "title": "Lakeview Orthopaedics: records and right knee surgical date", "due": "2026-08-30", "owner": "Alex Counsel", "origin": "clio-task", "daysLate": 33,
     "waitingOn": {"name": "Lakeview Orthopaedics PLLC", "contactId": "810002", "kind": "provider", "requests": 3, "daysSilent": 31}, "refs": [T_LAKE]},
     {"id": "task:100041", "title": "Client: employment records", "due": "2026-09-28", "owner": "Alex Counsel", "origin": "clio-task", "daysLate": 4,
     "waitingOn": {"name": "Jane Doe", "contactId": "800001", "kind": "client", "requests": 1, "daysSilent": 10}, "refs": [T_EMP]}],
   "upcoming": [{"id": "task:100042", "title": "Riverside PT: itemized ledger", "due": "2026-10-09", "owner": "Alex Counsel", "origin": "clio-task", "daysUntil": 7, "refs": [T_RIV]},
     {"id": "calendar_entry:100050", "title": "Compliance conference", "due": "2026-10-21", "owner": None, "origin": "clio-calendar", "daysUntil": 19, "refs": [C_CONF]}],
   "waiting": [{"id": "task:100040", "title": "Lakeview Orthopaedics: records and right knee surgical date", "due": "2026-08-30", "owner": "Alex Counsel", "origin": "clio-task",
     "waitingOn": {"name": "Lakeview Orthopaedics PLLC", "contactId": "810002", "kind": "provider", "requests": 3, "daysSilent": 31}, "refs": [T_LAKE]}],
   "suggested": []},
 "timeline": [
   {"id": "t1", "date": "2024-03-10", "derivation": "clio-metadata", "title": "Incident", "category": "incident", "milestone": True, "refs": [ref("2024-03-10", "custom_field", "date-30001", None)]},
   {"id": "t2", "date": "2024-03-15", "derivation": "clio-metadata", "title": "Firm retained", "category": "legal", "milestone": True, "refs": [ref("2024-03-15", "calendar_entry", 100046, "2024-03-15")]},
   {"id": "t3", "date": "2024-06-04", "derivation": "stated", "title": "Left shoulder surgery", "category": "treatment", "milestone": True, "refs": [N_POST]},
   {"id": "t4", "date": "2025-03-01", "derivation": "clio-metadata", "title": "Suit filed", "category": "legal", "milestone": True, "refs": [ref("2025-03-01", "calendar_entry", 100048, "2025-03-01")]},
   {"id": "t5", "date": "2026-09-05", "derivation": "stated", "title": "Coverage confirmed", "category": "insurance", "milestone": True, "refs": [N_COV]},
   {"id": "t6", "date": "2026-09-28", "derivation": "clio-metadata", "title": "Call with client", "category": "communication", "milestone": False, "refs": [CALL]}],
 "injuries": [
   {"name": "Left shoulder labral tear", "bodyPart": "Left shoulder", "status": "surgery-done", "firstDocumented": "2024-06-04", "refs": [BOP2]},
   {"name": "Right knee medial meniscus tear", "bodyPart": "Right knee", "status": "surgery-recommended", "firstDocumented": None, "refs": [BOP3]}],
 "stage": {"key": "discovery", "label": "In litigation (discovery)", "evidence": [C_CONF], "inferred": True},
 "openQuestions": [{"text": "When will the right knee surgery be scheduled?", "refs": [N_POSTURE]}],
 "changeFeed": [{"kind": "new", "sourceType": "note", "clioId": "100008", "title": "Case posture", "sourceDate": "2026-09-20", "detectedAt": "2026-10-02T10:00:00Z", "drawerKey": "note:100008"}],
 "meta": {"models": {"synth": "claude-sonnet-5-5", "extract": "claude-haiku-4-5"}, "costUsd": 0.21, "droppedRefs": 1, "droppedClaims": 0, "warnings": [], "builtAt": "2026-10-02T11:00:00Z", "cached": True}}
provider_view = {
 "firmName": "Example Law Firm", "recipientLabel": "Riverside Physical Therapy", "clientDisplayName": "Jane D.",
 "attorneyNote": "Thanks for treating Jane. The updated ledger is the main thing we need this month.",
 "status": {"label": "Active", "alive": "active", "lastFirmActivity": "2026-09-28", "nextEvent": "2026-10-21"},
 "stage": {"label": "In litigation"},
 "coverage": {"confirmed": True, "confirmedOn": "2026-09-05", "layers": None},
 "needs": [{"id": "task:100042", "text": "Send an itemized ledger for services after January 2025", "due": "2026-10-09"}],
 "bill": {"amount": 12000, "servicesThrough": "2025-01-08", "stale": True},
 "appointments": [{"title": "Client treatment", "date": "2026-10-06"}],
 "records": [{"name": "Physical therapy records", "date": "2025-01-15"}],
 "updates": [{"date": "2026-09-05", "text": "Insurance coverage confirmed in writing"}, {"date": "2025-03-01", "text": "Lawsuit filed"}],
 "careTeam": [{"name": "Lakeview Orthopaedics PLLC", "role": "Orthopaedic surgery"}],
 "findings": [{"text": "Left shoulder labral tear, surgery 2024-06-04", "source": "Bill of Particulars p2"}],
 "sharedAt": "2026-10-02T11:00:00Z", "expiresAt": "2026-10-09T11:00:00Z"}
json.dump(digest, open(os.path.join(D, "sample-digest.json"), "w"), indent=1)
json.dump(provider_view, open(os.path.join(D, "sample-provider-view.json"), "w"), indent=1)
print("ok")
