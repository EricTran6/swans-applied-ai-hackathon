import { describe, it, expect } from "vitest";
import { isTreatmentEntry } from "./treatment";

describe("isTreatmentEntry", () => {
  const treatment = [
    "Client treatment: physical therapy, Example Clinic",
    "Surgery: right shoulder arthroscopy",
    "Post-op visit",
    "Pre-op evaluation",
    "Orthopaedic consult",
    "Follow-up visit",
    "Chiropractic adjustment",
    "Appointment at Example PT",
  ];
  const notTreatment = [
    "Call to Example Ortho re right shoulder surgical date",
    "Calling Example Ortho about surgery",
    "Follow-up call with client re treatment status",
    "Phone conference re therapy",
    "Email to provider re surgery",
    "E-mail Example Clinic about appointment",
    "Records request to Example Clinic",
    "Request medical records, treatment notes",
    "Ledger update for therapy bills",
    "Bill review: surgery",
    "Letter to Example Clinic re treatment",
    "Fax to provider re visit",
    "Chaser for therapy records",
    "Reminder: client treatment",
    "Deadline: surgery paperwork",
    "Deposition of treating surgeon",
    "Court hearing re surgery",
    "IME",
    "Compliance conference",
    "Mediation",
    "",
  ];
  it.each(treatment)("treats %j as client treatment", (t) => expect(isTreatmentEntry(t)).toBe(true));
  it.each(notTreatment)("does not treat %j as client treatment", (t) => expect(isTreatmentEntry(t)).toBe(false));
});
