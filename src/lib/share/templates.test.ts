import { describe, it, expect } from "vitest";
import { humanizeFilename, isProviderSafe, templateNeed, templateUpdate, providerFor } from "./index";
import { formatShortDate, templateCorrespondence } from "./templates";
import { fixtureProviders, fixtureRecords } from "./__tests__/fixture-records";

describe("templateNeed rewrites internal task text", () => {
  it("ledger with a period", () => {
    expect(templateNeed("By medical provider: Some PT - itemized ledger", "Ledger since Jan 2025. Valuation problem.")).toBe("Send an itemized ledger for services after January 2025");
  });
  it("records plus surgical date", () => {
    expect(templateNeed("By medical provider: X - records and right knee surgical date", "4 requests so far.")).toBe("Send updated treatment records, and confirm the surgery date");
  });
  it("falls back to a generic sentence and never echoes internal words", () => {
    const t = templateNeed("By medical provider: X - closes out specials, settlement strategy", "");
    expect(t).toBe("Send the documents the firm requested");
    expect(isProviderSafe(t)).toBe(true);
  });
});

describe("templateUpdate", () => {
  it("maps structured legal/insurance events and returns null for anything else", () => {
    expect(templateUpdate("Suit filed", "legal")).toBe("Lawsuit filed");
    expect(templateUpdate("Coverage confirmed", "insurance")).toBe("Insurance coverage confirmed in writing");
    expect(templateUpdate("Records received from PT", "legal")).toBe("Records received by the firm");
    expect(templateUpdate("Right shoulder surgery recommended", "treatment")).toBe("Surgery recommended, date pending");
    expect(templateUpdate("Case evaluation $123,456", "legal")).toBeNull();
    expect(templateUpdate("Medicaid lien asserted", "money")).toBeNull();
  });
});

describe("helpers", () => {
  it("humanizes filenames", () => {
    expect(humanizeFilename("02-pleadings__bill-of-particulars.pdf")).toBe("Bill of particulars");
    expect(humanizeFilename("05 some_bill.PDF")).toBe("Some bill");
  });
  it("isProviderSafe trips on dollars and internal words", () => {
    expect(isProviderSafe("Send updated treatment records")).toBe(true);
    for (const bad of ["$5", "1,200 owed", "lien", "settlement talks", "IME", "case posture", "Medicaid"]) expect(isProviderSafe(bad)).toBe(false);
  });
  it("providerFor picks the single best provider, null on no match or tie", () => {
    const provs = fixtureProviders(fixtureRecords());
    const pt = provs.find((p) => /physical/i.test(p.name))!;
    expect(providerFor("04-medical-records__riverside-physical-therapy-records.pdf", provs)).toBe(pt.clioId);
    expect(providerFor("Prepare for compliance conference", provs)).toBeNull();
    expect(providerFor(provs.map((p) => p.name).join(" and "), provs)).toBeNull();
    expect(providerFor("anything", provs, [{ contactId: pt.clioId, name: pt.name, kind: "Company" }])).toBe(pt.clioId);
  });
});

describe("templateCorrespondence", () => {
  it("formats dates without timezone drift", () => {
    expect(formatShortDate("2023-07-04")).toBe("Jul 4, 2023");
    expect(formatShortDate("2023-12-17T23:30:00-08:00")).toBe("Dec 17, 2023");
    expect(formatShortDate("")).toBeNull();
    expect(formatShortDate("not a date")).toBeNull();
  });
  it("turns correspondence into a dated status line, never echoing the subject", () => {
    expect(templateCorrespondence("Records request", true, "2023-07-04")).toBe("Records request sent Jul 4, 2023");
    expect(templateCorrespondence("RE: Records request", true, "2023-08-01")).toBe("Records request sent Aug 1, 2023");
    expect(templateCorrespondence("Ledger request", true, "2026-09-10")).toBe("Itemized ledger request sent Sep 10, 2026");
    expect(templateCorrespondence("RE: records enclosed", false, "2023-12-17")).toBe("Your records received Dec 17, 2023");
    expect(templateCorrespondence("Invoice attached", false, "2023-12-17")).toBe("Your bill received Dec 17, 2023");
    expect(templateCorrespondence("Call re: settlement posture $5,000", true, "2023-12-17")).toBe("Request sent to your office Dec 17, 2023");
    expect(templateCorrespondence("Call re: settlement posture $5,000", false, "2023-12-17")).toBe("Correspondence received from your office Dec 17, 2023");
    expect(templateCorrespondence("Records request", true, "")).toBeNull();
  });
});
