// Hand-written flashcards. The build also derives cards from numbers.mjs
// (context → value), glossary.mjs (term → definition) and comparisons.mjs
// (Portugal vs Florida practice questions).
// t: distinction | formula | trigger | rule-app | app-rule | def-term | scenario
// chk (optional): array of keywords; if the typed answer contains all of
// them (case-insensitive) the app suggests "looks correct".

export const flashcards = [
  // Orientation / license law
  { id: "F-001", l: "L01-1", t: "distinction", f: "Statute vs administrative rule: what is the difference, with one Florida real estate example of each?", b: "A statute is passed by the Legislature (Chapter 475 F.S., the license law). A rule is adopted by an agency under a statute's authority (Rule 61J2 F.A.C., e.g., escrow deposit deadlines adopted by FREC)." },
  { id: "F-002", l: "L01-1", t: "distinction", f: "DBPR vs FREC — who investigates, who disciplines, who issues licenses?", b: "DBPR issues licenses and investigates complaints. FREC adopts rules and disciplines (final orders). Courts handle crimes and civil damages.", chk: ["dbpr", "frec"] },
  { id: "F-003", l: "L02-1", t: "rule-app", f: "The three elements that require a real estate license.", b: "A real estate service, for another, for compensation (paid, promised or expected).", chk: ["another", "compensation"] },
  { id: "F-004", l: "L02-2", t: "scenario", f: "A builder's salaried employee sells the builder's homes. Then she's paid per closing. License needed?", b: "Salaried only: exempt. Paid per closing: license required — the exemption depends on no commission/transaction-based pay." },
  { id: "F-005", l: "L02-3", t: "distinction", f: "Mutual recognition: who can use it, and what exam do they take?", b: "Only applicants who are NOT Florida residents when they apply, licensed in a state with an agreement. They take a 40-question Florida law exam and need 30 correct." },
  { id: "F-006", l: "L03-3", t: "distinction", f: "Missed post-license education vs missed continuing education: consequences?", b: "Post-license (45 hrs) missed before first renewal → license null and void. CE (14 hrs) missed at a later renewal → involuntary inactive (recoverable for 2 years).", chk: ["void", "inactive"] },
  { id: "F-007", l: "L03-3", t: "trigger", f: "Involuntary inactive for 18 months. What does reactivation require?", b: "The 28-hour commission-prescribed reactivation course (more than 12 but less than 24 months). ≤12 months: 14 hours. >24 months: license expired.", chk: ["28"] },
  { id: "F-008", l: "L03-4", t: "trigger", f: "What event starts a 10-day clock and what event starts a 30-day clock for a licensee's duty to notify DBPR?", b: "10 days: change of mailing address. 30 days: conviction, guilty plea or nolo contendere plea." },
  { id: "F-009", l: "L03-2", t: "distinction", f: "Group license vs multiple licenses.", b: "Group license: a sales associate (or broker associate) works for several CONNECTED entities of one owner-developer. Multiple licenses: a BROKER holds separate licenses for unconnected brokerages." },

  // Brokerage relationships
  { id: "F-010", l: "L04-1", t: "rule-app", f: "Presumed brokerage relationship in Florida?", b: "Transaction broker (unless single agent or no brokerage relationship is established in writing).", chk: ["transaction"] },
  { id: "F-011", l: "L04-2", t: "distinction", f: "Name the four duties owed ONLY by a single agent.", b: "Loyalty, obedience, (full) confidentiality, full disclosure.", chk: ["loyalty", "obedience"] },
  { id: "F-012", l: "L04-2", t: "def-term", f: "Transaction-broker duty not to reveal that the seller will take less, the buyer will pay more, a party's motivation, or facts a party asks to keep confidential.", b: "Limited confidentiality.", chk: ["limited", "confidentiality"] },
  { id: "F-013", l: "L04-3", t: "trigger", f: "When must the No Brokerage Relationship Notice be given?", b: "Before showing the property." },
  { id: "F-014", l: "L04-3", t: "trigger", f: "When must the Single Agent Notice be given?", b: "Before or at the time of entering into a listing or representation agreement, or before showing property — whichever comes first." },
  { id: "F-015", l: "L04-3", t: "rule-app", f: "List four situations where brokerage disclosure is NOT required.", b: "Any four of: party already represented; bona fide open house/model showing; unanticipated casual encounter; general factual questions about advertised property; general info about qualifications/firm; auctions; appraisals; leases without an option to buy ≤4 units; nonresidential/commercial; business enterprises (except ≤4 residential units)." },
  { id: "F-016", l: "L04-4", t: "distinction", f: "Latent defect vs stigma: which must be disclosed in Florida?", b: "Known latent material defects (hidden roof leak, flooding) must be disclosed. Death on the property and HIV/AIDS status are declared not material." },
  { id: "F-017", l: "L04-4", t: "rule-app", f: "Which duties survive termination of a brokerage relationship?", b: "Confidentiality and accounting for funds.", chk: ["confidential", "account"] },

  // Brokerage operations
  { id: "F-018", l: "L05-1", t: "trigger", f: "Deposit received Wednesday (no holidays). Associate's deadline? Broker's deadline?", b: "Associate → broker: end of Thursday (next business day). Broker deposits: end of Monday (Thu 1, Fri 2, Mon 3).", chk: ["thursday", "monday"] },
  { id: "F-019", l: "L05-1", t: "distinction", f: "Commingling vs conversion.", b: "Commingling: mixing personal and escrow funds. Conversion: using escrow funds for personal or unauthorized purposes (more serious)." },
  { id: "F-020", l: "L05-2", t: "rule-app", f: "Four escrow dispute settlement procedures (M.A.L.E.).", b: "Mediation (all consent, 90 days), Arbitration (all consent, binding), Litigation (interpleader), Escrow disbursement order from FREC (only if the broker holds the funds)." },
  { id: "F-021", l: "L05-2", t: "rule-app", f: "Two statutory situations where a broker may return a deposit to the buyer without notifying FREC.", b: "A residential condo buyer cancels under s. 718.503; the buyer in good faith fails to satisfy the contract's financing clause." },
  { id: "F-022", l: "L05-3", t: "def-term", f: "An ad by a licensee that omits the registered brokerage name.", b: "Blind ad.", chk: ["blind"] },
  { id: "F-023", l: "L05-4", t: "rule-app", f: "Who may pay a sales associate for real estate services?", b: "Only the sales associate's employing broker (or owner-developer employer)." },

  // Discipline
  { id: "F-024", l: "L06-1", t: "rule-app", f: "Put in order: final order, probable cause, investigation, formal complaint, hearing, complaint, appeal.", b: "Complaint → investigation → probable cause → formal complaint → hearing → final order → appeal (30 days)." },
  { id: "F-025", l: "L06-2", t: "distinction", f: "Misrepresentation vs culpable negligence.", b: "Misrepresentation: a false statement (or concealment) of material fact. Culpable negligence: reckless indifference to others' rights — beyond simple carelessness, without intent to deceive." },
  { id: "F-026", l: "L06-3", t: "rule-app", f: "Who cannot recover from the Real Estate Recovery Fund?", b: "A licensee who acted as a licensee in the transaction (e.g., commission disputes); also excluded: amounts above caps, treble damages, court costs, attorney's fees, interest." },

  // Federal & state
  { id: "F-027", l: "L07-1", t: "distinction", f: "Steering vs blockbusting vs redlining.", b: "Steering: guiding buyers toward/away from areas by protected class. Blockbusting: scaring owners into selling because a protected class is moving in. Redlining: lender refusing or varying loans by area." },
  { id: "F-028", l: "L07-1", t: "distinction", f: "Reasonable modification vs reasonable accommodation.", b: "Modification: physical change to the unit (usually tenant pays). Accommodation: change in rules/policies (e.g., service animal despite no-pets rule)." },
  { id: "F-029", l: "L07-3", t: "trigger", f: "TILA's 3-business-day right of rescission applies to which loans?", b: "Refinances and home-equity loans on the borrower's principal residence — not purchase loans, not investment property." },
  { id: "F-030", l: "L07-2", t: "distinction", f: "Match: housing / credit / public accommodations / lending data.", b: "Fair Housing Act / ECOA / ADA / HMDA." },
  { id: "F-031", l: "L07-4", t: "trigger", f: "Security deposit timeline after the tenant moves out.", b: "15 days to return if no claim; certified-mail notice of claim within 30 days; tenant has 15 days to object. Missing the 30-day notice forfeits the claim.", chk: ["15", "30"] },

  // Property
  { id: "F-032", l: "L08-1", t: "distinction", f: "Remainder vs reversion.", b: "Remainder: future interest goes to a third party (remainderman). Reversion: it returns to the grantor or heirs." },
  { id: "F-033", l: "L08-2", t: "distinction", f: "Assignment vs sublease.", b: "Assignment: the ENTIRE remaining term; assignee pays landlord; original tenant secondarily liable unless released. Sublease: part of the term or space; subtenant pays tenant; tenant stays primarily liable." },
  { id: "F-034", l: "L08-3", t: "scenario", f: "Married couple, deed silent. Unmarried pair, deed silent. How is title held in each case?", b: "Married: tenancy by the entireties. Unmarried: tenancy in common." },
  { id: "F-035", l: "L08-4", t: "distinction", f: "Florida homestead: name the three separate legal effects.", b: "(1) Protection from forced sale by most creditors; (2) restrictions on transfer and devise when there is a spouse/minor child (spouse joins deeds and mortgages); (3) property-tax exemption." },
  { id: "F-036", l: "L08-5", t: "distinction", f: "Condominium vs cooperative ownership.", b: "Condo: deed to a unit (real property) + undivided share of common elements. Co-op: shares in the corporation + proprietary lease (personal property)." },

  // Title
  { id: "F-037", l: "L09-2", t: "distinction", f: "General warranty vs special warranty deed.", b: "General: grantor warrants against defects from any time. Special: only defects arising during the grantor's ownership." },
  { id: "F-038", l: "L09-2", t: "rule-app", f: "What makes a Florida deed valid, and what is needed only for recording?", b: "Valid: writing, competent grantor, identifiable grantee, consideration, words of conveyance, legal description, grantor's signature + 2 witnesses, delivery and acceptance. Recording: notary acknowledgment." },
  { id: "F-039", l: "L09-4", t: "distinction", f: "Easement appurtenant vs easement in gross.", b: "Appurtenant: benefits an adjacent parcel (dominant/servient), runs with the land. In gross: benefits a person or company (utility), no dominant estate." },
  { id: "F-040", l: "L09-4", t: "distinction", f: "Adverse possession vs easement by prescription (Florida periods).", b: "Adverse possession (title): 7 years + color of title or payment of taxes. Prescription (easement): 20 years of adverse use.", chk: ["7", "20"] },
  { id: "F-041", l: "L09-5", t: "distinction", f: "Accretion vs avulsion.", b: "Accretion: gradual deposit of soil — owner gains land, boundary moves. Avulsion: sudden change — boundary does not move." },
  { id: "F-042", l: "L09-5", t: "rule-app", f: "Four tests for whether an item is a fixture.", b: "Intent (most important), method of annexation, adaptation to the property, relationship of the parties. Trade fixtures stay the tenant's." },

  // Legal descriptions & formulas
  { id: "F-043", l: "L10-2", t: "formula", f: "Acreage of an aliquot description.", b: "640 ÷ (product of the denominators). Use AND to add separate parcels." },
  { id: "F-044", l: "L10-2", t: "rule-app", f: "Where is section 1, section 6, section 31, section 36?", b: "1 = NE corner; 6 = NW; 31 = SW; 36 = SE (serpentine numbering from the NE)." },
  { id: "F-045", l: "L14-1", t: "formula", f: "The percent triangle.", b: "Part = Total × Rate; Total = Part ÷ Rate; Rate = Part ÷ Total." },
  { id: "F-046", l: "L14-1", t: "formula", f: "Percentage change.", b: "(New − Old) ÷ Old. The base is always the starting value." },
  { id: "F-047", l: "L14-3", t: "formula", f: "Sale price needed to net the seller a given amount.", b: "Price = (Net + fixed costs) ÷ (1 − commission rate). Never multiply the net by (1 + rate)." },
  { id: "F-048", l: "L14-4", t: "formula", f: "Recover the original cost from a sale price and profit %.", b: "Cost = Sale ÷ (1 + profit%). For a loss: Cost = Sale ÷ (1 − loss%)." },
  { id: "F-049", l: "L14-5", t: "formula", f: "Loan-to-value ratio.", b: "LTV = loan ÷ lesser of sale price or appraised value." },
  { id: "F-050", l: "L14-5", t: "formula", f: "First month's interest on an amortized loan.", b: "Balance × annual rate ÷ 12. Principal = payment − interest." },
  { id: "F-051", l: "L14-6", t: "formula", f: "Deed stamps, note stamps, intangible tax — formulas and who customarily pays.", b: "Deed: round price UP to $100 → ÷100 × $0.70 (seller). Note: round loan UP → ÷100 × $0.35 (buyer; new and assumed). Intangible: new loan × 0.002 (buyer)." },
  { id: "F-052", l: "L14-7", t: "rule-app", f: "Proration of unpaid property taxes: which party is debited?", b: "Debit seller, credit buyer (taxes paid in arrears)." },
  { id: "F-053", l: "L14-7", t: "rule-app", f: "Proration of rent collected in advance by the seller: which party is credited?", b: "Credit buyer, debit seller, for the buyer's days (including the closing day)." },
  { id: "F-054", l: "L14-8", t: "rule-app", f: "Single or double entry? Binder deposit; new mortgage; assumed mortgage; seller's payoff.", b: "Deposit: credit buyer (single). New mortgage: credit buyer (single). Assumed mortgage: debit seller + credit buyer (double). Payoff: debit seller (single)." },
  { id: "F-055", l: "L12-3", t: "formula", f: "Housing ratio and total obligations ratio.", b: "Housing = PITI ÷ gross monthly income. Total = (PITI + recurring debts) ÷ gross monthly income. Course benchmarks: 28/36 conventional; 31/43 FHA." },
  { id: "F-056", l: "L16-4", t: "formula", f: "IRV and how to build NOI.", b: "Value = NOI ÷ cap rate. NOI = PGI − vacancy & collection loss − operating expenses (NOT debt service or depreciation)." },
  { id: "F-057", l: "L16-4", t: "formula", f: "GRM vs GIM.", b: "GRM = price ÷ MONTHLY gross rent (1–4 units). GIM = price ÷ ANNUAL gross income." },
  { id: "F-058", l: "L16-3", t: "formula", f: "Cost approach.", b: "Value = land value + (cost new − accrued depreciation)." },
  { id: "F-059", l: "L16-2", t: "rule-app", f: "Sales comparison adjustment direction.", b: "Adjust the comparable, never the subject. Comparable better → subtract; comparable inferior → add (CBS / CIA)." },
  { id: "F-060", l: "L18-2", t: "formula", f: "Property tax with homestead exemptions.", b: "School tax = (assessed − 25,000) × school mills ÷ 1,000. Non-school = (assessed − 50,000*) × other mills ÷ 1,000. (*second exemption is up to $25,000, CPI-indexed since 2025.)" },
  { id: "F-061", l: "L17-1", t: "formula", f: "Cash flow and cap rate.", b: "Cash flow = NOI − debt service. Cap rate = NOI ÷ price." },

  // Finance
  { id: "F-062", l: "L12-2", t: "distinction", f: "Assumption vs 'subject to'.", b: "Assumption: buyer becomes personally liable (seller stays secondarily liable unless novation). Subject to: buyer pays but has no personal liability." },
  { id: "F-063", l: "L13-1", t: "distinction", f: "FHA vs VA: role and borrower charge.", b: "FHA insures (borrower pays MIP). VA guarantees (borrower pays funding fee). Neither lends." },
  { id: "F-064", l: "L13-3", t: "distinction", f: "Primary vs secondary mortgage market.", b: "Primary: originates loans (banks, credit unions, mortgage bankers/brokers). Secondary: buys existing loans (Fannie Mae, Freddie Mac; Ginnie Mae guarantees FHA/VA securities)." },

  // Contracts
  { id: "F-065", l: "L11-1", t: "distinction", f: "Void vs voidable vs unenforceable.", b: "Void: no contract at all. Voidable: one party may cancel (minor, fraud, duress). Unenforceable: valid but a court won't enforce (no required writing, time-barred)." },
  { id: "F-066", l: "L11-3", t: "distinction", f: "Exclusive right of sale vs exclusive agency: owner sells to her neighbour herself.", b: "Exclusive right of sale: commission owed. Exclusive agency: no commission." },
  { id: "F-067", l: "L11-2", t: "rule-app", f: "Effect of a counteroffer on the original offer.", b: "It rejects and terminates the original offer permanently." },

  // Planning & tax
  { id: "F-068", l: "L19-1", t: "distinction", f: "Variance vs special exception.", b: "Variance: deviation from a dimensional rule due to hardship unique to the parcel. Special exception: a use the code allows with case-by-case approval." },
  { id: "F-069", l: "L19-1", t: "distinction", f: "Police power vs eminent domain.", b: "Police power: regulation (zoning, codes), no compensation. Eminent domain: taking for public use, just compensation required." },
  { id: "F-070", l: "L18-3", t: "distinction", f: "1031 exchange vs principal-residence exclusion.", b: "1031: investment/business real property exchanged for like-kind; gain deferred; boot taxable. Residence: exclude $250k/$500k gain if owned and used 2 of last 5 years." },
];
