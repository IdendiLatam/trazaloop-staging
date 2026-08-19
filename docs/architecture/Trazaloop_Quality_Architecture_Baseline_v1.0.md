# Trazaloop Quality — Architecture Baseline v1.0

**File:** `Trazaloop_Quality_Architecture_Baseline_v1.0.md`  
**Date:** 2026-08-17  
**Status:** APPROVED / FROZEN BASELINE FOR IMPLEMENTATION  
**Product:** Trazaloop Quality  
**Platform:** Trazaloop  
**Target stack:** Next.js + TypeScript + Supabase/PostgreSQL + Supabase Auth + private Storage + RLS + Vercel  
**Purpose:** Single authoritative architecture baseline to be used before technical discovery, schema mapping, migrations, and implementation.

---

## 0. How to use this document

This file is the **authoritative implementation baseline** for Trazaloop Quality.

It consolidates the architecture decisions already approved for:

- master functional architecture;
- process architecture principles;
- documented information / TrazaDocs evolution;
- people, positions, competencies, knowledge and training;
- objectives, indicators and performance automation;
- supplier management;
- customer voice and satisfaction;
- risks and opportunities;
- nonconformities, findings, corrective actions and improvement;
- audits;
- management review;
- transversal automation, alerts and AI;
- relational master data model.

### Rules for implementation teams and coding agents

1. **Do not redesign Quality from scratch.**
2. **Do not replace frozen decisions with personal preferences.**
3. The repository and database are the source of truth for **physical names and existing implementation**, but this document is the source of truth for **target architecture and product semantics**.
4. If the current implementation conflicts with this baseline, document the conflict and propose alternatives before changing the baseline.
5. Do not infer that a UI, file, route or table name means a capability is actually implemented.
6. Prefer **reuse and evolution** of existing Trazaloop primitives over duplicated parallel systems.
7. Do not create tables by ISO clause.
8. Do not treat Quality as a document repository.
9. Do not treat AI as a transactional engine.
10. Do not allow commercial plan logic to replace authorization.

### Approval note

The detailed Process Domain v1.0 was discussed before the later domains. Its essential architecture is already captured and frozen through the approved master decisions DA-03 through DA-18 and through the later approved domains that depend on it. This baseline therefore includes the **approved process semantics** required for implementation. Any additional process-detail choice not explicitly frozen should be treated as a technical design decision requiring compatibility with the principles in this file.

---

# 1. Product definition

Trazaloop Quality is a transversal, sector-neutral Quality Management System capability for Trazaloop.

It must work for organizations such as:

- manufacturing;
- services;
- consulting;
- education;
- health;
- technology;
- logistics;
- commerce;
- construction;
- public organizations;
- private organizations;
- SMEs;
- large organizations.

It is **not** a PCR-specific module and **not** a textile-specific module.

Organizations may subscribe to Quality independently or together with:

- Trazaloop PCR / NTC 6632 / UNE-EN 15343;
- Trazaloop Textiles;
- TrazaDocs;
- Trazaloop Audit;
- other future modules.

Quality is intended to become a **digital living representation of the management system**, not a collection of ISO forms.

Core management chain:

```text
DOCUMENTS
+
PROCESSES
+
RESPONSIBLES
+
OBJECTIVES
+
INDICATORS
+
RISKS
+
ACTIONS
+
EVIDENCE
+
RESULTS
+
IMPROVEMENT
```

Management cycle:

```text
PLAN
→ DOCUMENT
→ EXECUTE
→ MEASURE
→ EVALUATE
→ CORRECT
→ IMPROVE
```

Core aspiration:

> **People work for the organization; Trazaloop Quality works for the management system.**

---

# 2. Foundational philosophy

## 2.1 Zero Duplicate Management

> A business data point should not be requested again for the QMS if Trazaloop can reliably obtain it from an existing source.

## 2.2 Capture Once, Reuse Many Times

A single reliable event or datum should be reusable by multiple domains.

Example:

```text
delivery_date
```

may feed:

- operational performance;
- supplier performance;
- customer experience;
- risk signals;
- audit preparation;
- management review.

## 2.3 Quality by Observation

Whenever technically possible, Quality should **observe actual operation** instead of asking people to report it again.

Quality should behave as:

> the organized memory, monitoring layer and intelligence layer of the organization.

## 2.4 Structured truth first

PostgreSQL stores the structured business truth.

Automation engines coordinate deterministic behavior.

AI helps understand, summarize, compare, detect and propose.

People retain responsibility for important decisions.

## 2.5 Historical truth matters

Quality must be able to answer:

- What was effective on a given date?
- Who occupied a position at that time?
- Which indicator formula and target were applicable?
- Which risk assessment was current?
- Which document version governed the operation?
- Which decision was taken, by whom and when?

## 2.6 Evidence must not be fabricated

No system component, including AI, may fabricate:

- evidence;
- records;
- measurements;
- responsible persons;
- approvals;
- conformity;
- effectiveness.

---

# 3. Product boundaries

Quality should integrate broadly, but **must not indiscriminately become**:

- ERP;
- CRM;
- MES;
- HRIS;
- payroll;
- LMS;
- accounting software;
- full contract-management software;
- marketing automation;
- full BPM suite.

Quality should consume data and relationships from these systems when they are the operational source of truth.

---

# 4. Normative architecture

## 4.1 User-facing ISO experience

The primary Quality navigation should be understandable to organizations using the familiar clause structure:

```text
4. CONTEXT
5. LEADERSHIP
6. PLANNING
7. SUPPORT
8. OPERATION
9. PERFORMANCE EVALUATION
10. IMPROVEMENT
```

## 4.2 Internal architecture

Navigation is **not** the data model.

Internal domain structure:

```text
ORGANIZATION
├ STRATEGY
├ PROCESS MAP
├ PROCESSES
├ FLOWS
├ PEOPLE
├ COMPETENCIES
├ KNOWLEDGE
├ DOCUMENTS
├ SUPPLIERS
├ CUSTOMERS
├ OBJECTIVES
├ INDICATORS
├ RISKS
├ AUDITS
├ ACTIONS
└ EVIDENCE
```

## 4.3 Normative mapping

ISO requirements are a **versioned mapping layer** over the business objects.

Do not create:

```text
iso_clause_4_data
iso_clause_5_data
iso_clause_6_data
```

A mapping may indicate:

- related;
- supports;
- evidences.

It must **not automatically conclude conformity**.

## 4.4 Future ISO edition handling

Quality was designed to support transition toward ISO 9001:2026, but normative requirements must remain versionable and updateable.

The implementation must not hard-code unverified future wording into the business data model.

---

# 5. Master architecture layers

```text
LAYER 1 — TRAZALOOP PLATFORM
organizations · users · memberships · auth · plans · RLS · Storage

LAYER 2 — OPERATION & INTEGRATIONS
PCR · Textiles · Audit · TrazaDocs · ERP · CRM · MES · HRIS · APIs · files

LAYER 3 — TRANSVERSAL ENGINES
documents · workflows · evidence · events · rules · alerts · relations

LAYER 4 — QUALITY DOMAINS
strategy · processes · people · performance · suppliers · customers
risks · cases · actions · audits · management review

LAYER 5 — AUTOMATION / COHERENCE
events · schedules · rules · tasks · impact analysis · consistency

LAYER 6 — AI
Quality Copilot and contextual specialized capabilities

LAYER 7 — ISO EXPERIENCE
clause navigation · normative matrix · maturity · reporting
```

---

# 6. Frozen master decisions DA-01 to DA-33

These are approved architectural decisions.

- **DA-01** — ISO numeral experience with decoupled business-domain architecture.
- **DA-02** — A transversal Coherence Engine will exist.
- **DA-03** — Process map uses four master groups: Strategic, Missional, Support and System.
- **DA-04** — Every visual process block corresponds to a real Process entity.
- **DA-05** — The published process map is the official current representation of process architecture.
- **DA-06** — Process connectors are structured interactions, not decorative lines.
- **DA-07** — Published process maps are versioned and immutable.
- **DA-08** — Process and Procedure are different concepts.
- **DA-09** — Quality begins with a simple native functional-flow notation before full BPMN.
- **DA-10** — Flow inputs/outputs connect directly to process interactions.
- **DA-11** — Published functional process diagrams are versioned.
- **DA-12** — AI may detect inconsistencies but does not autonomously publish structural changes.
- **DA-13** — Process characterization is generated from structured process data.
- **DA-14** — Position functions may link directly to process activities.
- **DA-15** — Structural process-map and flow changes may trigger impact analysis.
- **DA-16** — Maps and flows use configurable periodic/event-driven review, not artificial annual versioning.
- **DA-17** — Capture Once, Reuse Many Times.
- **DA-18** — Automated measurements preserve lineage.
- **DA-19** — TrazaDocs evolves into the transversal document engine.
- **DA-20** — Position and Person are independent entities.
- **DA-21** — Formal annual applicable personnel evaluation.
- **DA-22** — Annual training/development plan plus effectiveness evaluation.
- **DA-23** — Training attendance is not the same as effectiveness.
- **DA-24** — Knowledge is a first-class domain.
- **DA-25** — Lessons learned may produce actual system changes.
- **DA-26** — Active evaluable suppliers have formal annual reevaluation minimum.
- **DA-27** — Customer satisfaction is multisource with a formal annual close.
- **DA-28** — Complaints/claims are distinct from satisfaction.
- **DA-29** — Events, rules, alerts and escalation are transversal.
- **DA-30** — AI inherits permissions and tenant isolation.
- **DA-31** — AI is not autonomous for employment or formal QMS decisions.
- **DA-32** — Quality does not indiscriminately become ERP/CRM/MES/HRIS/LMS.
- **DA-33** — Normative matrix is versioned for ISO updates.

---

# 7. Process architecture

## 7.1 Process map

The map is structured, not decorative.

It is not:

- an uploaded image;
- PowerPoint;
- PDF;
- isolated drawing canvas.

A process can exist as draft before it appears in the published map.

Process lifecycle concept:

```text
Draft
→ Review
→ Approved
→ Effective
→ Retired
```

The published map must remain synchronized with the active process catalog.

Removing or retiring a process does not delete its history.

Purely visual layout changes should be distinguished from structural changes.

## 7.2 Process interactions

Connectors must be structured relationships with fields such as:

- source process;
- destination process;
- output;
- receiving input;
- information/record;
- transfer owner;
- frequency where useful;
- criterion/control where useful.

The interaction should be stored once and reflected consistently in both processes.

## 7.3 Functional process flow

Core representation:

```text
INPUTS
→ ACTIVITIES
→ OUTPUTS
```

Initial node types:

- Start;
- Input;
- Stage;
- Activity;
- Decision;
- Output;
- Subprocess;
- End.

Possible later nodes:

- Wait;
- Event;
- Document/record.

Optional swimlanes may use:

- position;
- organizational unit;
- external actor.

Prefer position over named individual.

## 7.4 Activity relations

Activities may relate to:

- positions;
- documents;
- records/evidence;
- controls;
- risks;
- indicators;
- resources;
- systems;
- business rules;
- competencies.

## 7.5 Process ≠ Procedure

One process may have zero or many procedures.

A procedure may support more than one process.

Not every activity requires a procedure.

## 7.6 Process characterization

Characterization is a generated view/document from:

- structured process object;
- map;
- flow;
- interactions;
- responsibilities;
- documents;
- indicators;
- risks.

Do not maintain a second manually duplicated characterization source.

## 7.7 Process health

Possible dimensions:

- structure;
- owner;
- flow;
- documents;
- indicators;
- risks;
- competence;
- open actions.

Result labels such as “Requires attention” must not be expressed as automatic ISO nonconformity.

---

# 8. Document domain — approved baseline D-01 to D-30

Core principle:

> **Quality does not control files; it controls information and its validity through time.**

## 8.1 Conceptual distinctions

Keep distinct:

```text
DOCUMENT
≠
FILE
≠
TEMPLATE
≠
RECORD
≠
EVIDENCE
```

Document is the persistent business identity.

Files are representations/content.

Approved revisions are immutable.

## 8.2 Lifecycle

Typical lifecycle:

```text
Creation
→ Draft
→ Review
→ Changes
→ Approval
→ Approved
→ Pending effective
→ Effective
→ Periodic review
→ Continue / New revision / Retire
```

Approval and effectiveness are separate.

Periodic review without changes does not create a new version.

Overdue review does not automatically make a document obsolete.

## 8.3 Obsolescence

Distinguish:

- superseded;
- retired;
- archived.

Obsolete information remains historically available and clearly marked as not for current use.

## 8.4 Master list

The Master Document List is a dynamic projection, not a parallel Excel or duplicated table.

## 8.5 External documents

External controlled documents are structured objects.

Control asks:

> Are we using the correct edition?

not merely:

> Do we have a PDF?

## 8.6 Approved document decisions

- **D-01** — Document and file are conceptually different.
- **D-02** — Every approved revision is immutable.
- **D-03** — Internal revision sequence is independent from visible version label.
- **D-04** — Document codes are not recycled.
- **D-05** — Preparation, decision and publication states are differentiated.
- **D-06** — Scheduled effectiveness may activate an approved version and supersede the prior one.
- **D-07** — Document changes may trigger impact analysis.
- **D-08** — Periodic review without changes does not create a version.
- **D-09** — Overdue review does not automatically make a document obsolete.
- **D-10** — Final disposition is controlled, not silent automatic deletion.
- **D-11** — Records preserve the exact revision of the template used.
- **D-12** — A new revision may trigger notification, required reading, training or competence evaluation.
- **D-13** — Master Document List is automatically derived.
- **D-14** — Document AI distinguishes actual system data from generated suggestions.
- **D-15** — The system can resolve the valid document revision for a historical date.
- **D-16** — Quality uses a transversal document engine derived from/evolving TrazaDocs.
- **D-17** — Document owner is preferably assigned to a position.
- **D-18** — Workflow supports multiple reviewers/approvers.
- **D-19** — Workflow supports sequential and parallel paths.
- **D-20** — Review/approval decisions are immutable historical events.
- **D-21** — External documents are controlled objects, not simple attachments.
- **D-22** — Document/template/record/evidence/file remain distinct.
- **D-23** — Obsolescence is managed by supersession or retirement events.
- **D-24** — Documents can relate directly to process activities.
- **D-25** — Process/flow/position/requirement changes may trigger document impact review.
- **D-26** — Exports are representations, not source of truth.
- **D-27** — AI respects document permissions/classification.
- **D-28** — Existing documentation can be migrated without assuming automatic effectiveness.
- **D-29** — Process characterization derives primarily from structured Process data.
- **D-30** — Linking documentation to a normative requirement does not automatically mean conformity.

---

# 9. People, positions, competencies and knowledge — approved PC-01 to PC-28

## 9.1 Structural chain

```text
PROCESS
→ ACTIVITY
→ POSITION
→ REQUIRED COMPETENCE
→ PERSON
→ DEMONSTRATED COMPETENCE
→ GAP
→ DEVELOPMENT
→ EFFECTIVENESS
→ KNOWLEDGE
```

Quality manages people only from the perspective needed by the management system.

It is not payroll.

## 9.2 Organization and positions

Org chart is generated from:

- organizational units;
- positions;
- hierarchy.

Position is independent from Person.

Process and document ownership should preferably point to Position.

Current person responsibility is resolved from the position assignment.

## 9.3 Competence

Competence is reusable.

It may relate to:

- position;
- specific process activity.

Required competence and demonstrated competence are distinct.

Evidence may include:

- education;
- experience;
- certificate;
- observation;
- practical assessment;
- training;
- performance evidence.

## 9.4 Performance and competence

Performance and competence are separate concepts.

AI must not autonomously assign final employee ratings or make high-impact employment decisions.

## 9.5 Development and training

Development is broader than training and may include:

- mentoring;
- supervised practice;
- rotation;
- self-study;
- coaching;
- training.

Attendance, learning, competence and effectiveness are separate.

## 9.6 Knowledge

Knowledge is a first-class domain.

Knowledge may be:

- explicit;
- tacit;
- mixed.

A critical knowledge item may have one or more holders.

Single-holder critical knowledge creates a continuity signal.

Lessons learned can generate:

- process changes;
- document changes;
- training;
- controls;
- risks;
- improvement.

## 9.7 Approved decisions

- **PC-01** — Quality manages people from the QMS perspective, not as payroll.
- **PC-02** — Org chart is generated from structured data.
- **PC-03** — Position and Person are independent.
- **PC-04** — Position functions can link to process activities.
- **PC-05** — Organizational Person and Trazaloop User are different entities.
- **PC-06** — Competence and performance are separate concepts.
- **PC-07** — AI does not autonomously assign final performance ratings or high-impact employment decisions.
- **PC-08** — Development is broader than training.
- **PC-09** — Evaluable development actions can close the loop with effectiveness evaluation.
- **PC-10** — Onboarding/offboarding may derive from position, process, documents, competence and knowledge.
- **PC-11** — Historical validity of structure, positions, assignments, competencies and evaluations is preserved.
- **PC-12** — AI may structure CV information only as a proposal pending validation.
- **PC-13** — Applicable personnel have a formal annual evaluation cycle.
- **PC-14** — Training/development has formal annual planning with continuous updates.
- **PC-15** — Attendance, learning, competence and effectiveness remain distinct.
- **PC-16** — Competencies may relate to both positions and activities.
- **PC-17** — Gaps may generate development actions; not all gaps imply training.
- **PC-18** — Critical knowledge is a structured object.
- **PC-19** — People may be knowledge holders without becoming exclusive owners of knowledge.
- **PC-20** — Quality detects concentration-of-knowledge risk.
- **PC-21** — Lessons learned are managed objects capable of producing system changes.
- **PC-22** — Training may be proposed from document/process/audit/risk/evaluation changes.
- **PC-23** — Position-profile changes do not rewrite historical requirements.
- **PC-24** — Certifications and competence evidence may expire.
- **PC-25** — People files have stricter permissions than general organizational data.
- **PC-26** — Imported people/position data must be validated for consistency.
- **PC-27** — AI follows user permissions for people data.
- **PC-28** — Operational data may support evaluations but not determine them automatically.

---

# 10. Objectives, indicators and performance — approved OI-01 to OI-33

## 10.1 Core chain

```text
STRATEGY
→ OBJECTIVES
→ PROCESSES / INITIATIVES
→ INDICATORS
→ TARGETS
→ MEASUREMENTS
→ PERFORMANCE EVENT
→ ANALYSIS
→ ACTION
→ IMPROVEMENT
```

## 10.2 Indicator semantics

Indicator consists of:

```text
Definition
+ Owner
+ Source
+ Formula
+ Unit
+ Direction
+ Frequency
+ Target
+ Measurements
+ Analysis
+ Evidence
+ Actions
```

## 10.3 Source maturity

Supported source types:

- manual;
- imported;
- native Trazaloop;
- integration/API;
- derived.

## 10.4 Measurement lineage

Automated measurements must preserve:

- source;
- formula version;
- target applicable;
- period;
- source record context;
- calculation run where relevant.

## 10.5 Measurement quality

Keep separate:

```text
PERFORMANCE STATE
≠
DATA QUALITY STATE
```

Also distinguish:

```text
0
≠
NO DATA
≠
NOT APPLICABLE
```

## 10.6 Target miss

Below target does **not** automatically create a nonconformity.

It creates a performance event for analysis and possible treatment.

## 10.7 Approved decisions

- **OI-01** — Quality by Observation is central to performance.
- **OI-02** — Objectives may be hierarchical without rigid mandatory cascade.
- **OI-03** — Administrative state and performance state are separate.
- **OI-04** — Indicator direction/sense is structured.
- **OI-05** — Automatable indicators have executable calculation definitions separate from human-readable formulas.
- **OI-06** — Formulas have temporal validity.
- **OI-07** — Targets are historical and evaluated by applicable period.
- **OI-08** — Each indicator declares its automation mechanism.
- **OI-09** — Manual correction of automated results preserves the original.
- **OI-10** — Automated measurements preserve lineage.
- **OI-11** — Data quality and performance are separate.
- **OI-12** — Source changes after period close trigger controlled review.
- **OI-13** — Missing target does not automatically create NC.
- **OI-14** — Performance alerts support priority, deduplication and escalation.
- **OI-15** — AI distinguishes correlation, hypothesis and demonstrated causality.
- **OI-16** — Quality offers native indicators derived from its domains.
- **OI-17** — Methodology changes preserve comparability breaks.
- **OI-18** — Automatic objective state is configurable and explainable.
- **OI-19** — Time series may be related to system events.
- **OI-20** — Aggregated indicators declare consolidation method.
- **OI-21** — Zero, not applicable and unavailable are distinct.
- **OI-22** — Automated performance evaluation is explainable and auditable.
- **OI-23** — Quality favors useful indicators over metric proliferation.
- **OI-24** — Objectives/indicators preserve historical periods.
- **OI-25** — Indicators may measure company, objective, process, stage or activity.
- **OI-26** — Sources may be manual, imported, integrated, derived or native.
- **OI-27** — Preliminary and closed results are separate.
- **OI-28** — Corrected/invalidated measurements retain complete audit trail.
- **OI-29** — AI can propose indicators/formulas but requires validation.
- **OI-30** — Quality does not build automatic employee rankings from individual metrics.
- **OI-31** — Integration failures are technical/data issues, not poor performance.
- **OI-32** — Retired indicators preserve history and may identify a successor.
- **OI-33** — Management review can be automatically fed by objectives/indicators.

---

# 11. Supplier management — approved GP-01 to GP-33

## 11.1 Supplier lifecycle

```text
IDENTIFICATION
→ REGISTRATION
→ CLASSIFICATION
→ REQUIREMENTS
→ SELECTION
→ APPROVAL
→ OPERATION
→ PERFORMANCE
→ EVALUATION
→ REEVALUATION
→ DEVELOPMENT / RESTRICTION / WITHDRAWAL
```

Supplier is a role of a transversal external-party identity.

Approval/evaluation may apply to:

- supplier;
- site;
- category;
- combined scope.

## 11.2 Supplier status

Separate:

```text
RELATIONSHIP STATUS
≠
QUALITY APPROVAL STATUS
```

## 11.3 Criticality

Category and criticality are separate.

Criticality may modify:

- requirements;
- evaluation depth;
- audit frequency;
- escalation;
- review frequency.

## 11.4 Reevaluation

Active evaluable suppliers have a formal reevaluation cycle with maximum default of annual under the approved product policy; shorter cycles may be configured.

Extraordinary reevaluation may be triggered by:

- severe incident;
- deterioration;
- certification loss;
- critical document expiry;
- audit;
- repeated complaints;
- material change.

## 11.5 Approved decisions

- **GP-01** — Supplier domain manages quality, approval, risk and performance, not full purchasing ERP.
- **GP-02** — Supplier is a role of the transversal External Party master.
- **GP-03** — Evaluation can be scoped to supplier/site/category combinations.
- **GP-04** — Relationship state and approval state are separate.
- **GP-05** — Criticality methodology is configurable but structured.
- **GP-06** — Requirements may be informational, required or blocking.
- **GP-07** — A score never substitutes the formal approval decision.
- **GP-08** — Approved Supplier List is automatic.
- **GP-09** — Supplier evaluation reuses operational data first.
- **GP-10** — Active evaluable suppliers have formal minimum annual reevaluation.
- **GP-11** — AI may prepare reevaluation but not decide continuation.
- **GP-12** — Suspension, withdrawal and reactivation preserve full history.
- **GP-13** — AI comparisons/recommendations are explainable.
- **GP-14** — Supplier state can be reconstructed historically.
- **GP-15** — Evaluations preserve the methodology/criteria used.
- **GP-16** — Selection, evaluation and reevaluation are distinct events.
- **GP-17** — Supplier documentation has its own validity/review/validation.
- **GP-18** — Expired supplier documents do not automatically suspend unless an explicit rule says so.
- **GP-19** — Suppliers may have temporary approval conditions.
- **GP-20** — Criticality can alter frequency, depth and escalation.
- **GP-21** — Supplier incidents are independent of periodic evaluation.
- **GP-22** — A supplier incident does not automatically become a nonconformity.
- **GP-23** — Suppliers may have development plans with effectiveness evaluation.
- **GP-24** — Suppliers can relate to processes, inputs, risks, indicators and customers.
- **GP-25** — Extraordinary reevaluation can be event-driven.
- **GP-26** — Integration failure and real supplier deterioration are separate.
- **GP-27** — Suppliers can exist without user accounts.
- **GP-28** — Future supplier portal uses separate external permissions.
- **GP-29** — Exceptional use of non-approved supplier requires controlled justification.
- **GP-30** — Methodology changes do not rewrite historical evaluations.
- **GP-31** — AI distinguishes correlation and causality in supplier→process→customer analysis.
- **GP-32** — Supplier domain feeds management review.
- **GP-33** — Existing ERP suppliers may be mapped without unnecessary duplication.

---

# 12. Customer voice and satisfaction — approved VC-01 to VC-35

## 12.1 Multisource customer voice

Signals may come from:

- surveys;
- interviews;
- complaints;
- claims;
- compliments;
- returns;
- cancellations;
- renewals;
- repeat purchase;
- support;
- CRM;
- reviews;
- operational data.

Satisfaction is not only a survey.

## 12.2 Survey structure

Keep separate:

```text
SURVEY TEMPLATE
→ TEMPLATE VERSION
→ CAMPAIGN
→ AUDIENCE
→ RESPONSE
→ ANSWERS
```

Anonymous and identified modes must differ structurally, not only visually.

## 12.3 Annual close

Customer voice capture may be continuous.

The approved product policy requires a formal annual consolidated review for applicable customer segments.

## 12.4 Complaints

Complaints/claims are distinct from satisfaction.

A negative answer does not automatically become:

- complaint;
- NC;
- corrective action.

## 12.5 Approved decisions

- **VC-01** — Satisfaction is multisource.
- **VC-02** — Quality does not replace CRM/marketing automation.
- **VC-03** — Customer is a role of the External Party master.
- **VC-04** — Relational, periodic and transactional measurements are supported.
- **VC-05** — Formal annual satisfaction close exists.
- **VC-06** — Annual close includes methodology review.
- **VC-07** — Survey templates are versioned.
- **VC-08** — Anonymous and identified responses have different treatment.
- **VC-09** — Population, sample, responses and coverage are distinct.
- **VC-10** — Satisfaction result and measurement coverage/quality are distinct.
- **VC-11** — Closed responses are historical records and not silently overwritten.
- **VC-12** — Satisfaction calculation methodology is historical.
- **VC-13** — Quality does not impose NPS, CSAT or another universal methodology.
- **VC-14** — AI text classifications are correctable.
- **VC-15** — AI may detect critical feedback but not automatically create complaints/NC.
- **VC-16** — Complaints/claims and satisfaction are distinct domains.
- **VC-17** — Behavioral signals do not automatically equal satisfaction.
- **VC-18** — Quality by Observation applies to customer signals.
- **VC-19** — Customer alerts support priority, grouping and escalation.
- **VC-20** — AI may warn about coverage/bias without declaring statistical representativeness.
- **VC-21** — Satisfaction trends may be contextualized by system events.
- **VC-22** — Negative response does not automatically create NC.
- **VC-23** — Historical instruments, campaigns, methodology, results and actions are preserved.
- **VC-24** — Customer feedback does not automatically score employees.
- **VC-25** — External survey results may be imported with source/methodology preserved.
- **VC-26** — Template, campaign execution and results are different objects.
- **VC-27** — One template may support multiple campaigns without changing history.
- **VC-28** — Satisfaction calculations preserve sufficient lineage.
- **VC-29** — Anonymous responses minimize identifiable information.
- **VC-30** — Complaints escalate to NC/action only through rules/decision.
- **VC-31** — Compliments are managed information and may feed knowledge/improvement.
- **VC-32** — Comments may relate to processes, activities, suppliers, products or services.
- **VC-33** — AI distinguishes correlation, pattern and causal hypothesis.
- **VC-34** — Customer domain feeds management review.
- **VC-35** — CRM/ERP/help desk integration avoids duplication where operational source exists.

---

# 13. Risks and opportunities — approved RO-01 to RO-35

## 13.1 Risk structure

Preferred risk expression:

```text
CAUSE
→ RISK EVENT
→ CONSEQUENCE
```

Risk and Opportunity are different objects.

Risk may relate to:

- multiple processes;
- activities;
- objectives;
- suppliers;
- customers;
- people/competence;
- knowledge;
- documents;
- indicators.

## 13.2 Assessment

Risk methodology is configurable and versioned.

Possible models:

- qualitative;
- semi-quantitative;
- custom controlled methodology.

Support where used:

```text
INHERENT RISK
→ CONTROLS
→ RESIDUAL RISK
```

## 13.3 Controls

Control is not Action.

A control can be:

- preventive;
- detective;
- corrective;
- manual;
- automated;
- mixed.

Control effectiveness is independently assessable.

## 13.4 Risk signals

A Signal is different from a formal Risk.

Signals can be generated from:

- indicators;
- suppliers;
- customers;
- audits;
- people;
- processes;
- controls;
- events.

Signal may trigger review but does not autonomously modify the formal assessment.

## 13.5 Opportunities

Opportunities have their own:

- expected benefit;
- feasibility;
- effort/cost;
- priority;
- implementation;
- realized-benefit review.

## 13.6 Approved decisions

- **RO-01** — Risks and opportunities are distinct objects.
- **RO-02** — Risk has a main owner and multiple relations.
- **RO-03** — Risk methodology is configurable.
- **RO-04** — Historical assessments preserve methodology.
- **RO-05** — Risk matrix/heatmap is automatically derived.
- **RO-06** — Control and Action are distinct.
- **RO-07** — Inherent and residual risk are supported.
- **RO-08** — Acceptance above configured thresholds may require formal approval.
- **RO-09** — Reassessments never overwrite previous assessments.
- **RO-10** — Every active risk has a review date/rule.
- **RO-11** — Events may suggest risks/reviews but do not formally create risks without validation.
- **RO-12** — KRI may trigger review but not autonomously change assessment.
- **RO-13** — Risk signal and formal risk are distinct.
- **RO-14** — AI may detect possible duplicate risks but not merge them.
- **RO-15** — Opportunity prioritization uses its own methodology.
- **RO-16** — Implemented opportunities may evaluate realized benefit.
- **RO-17** — Relevant structural changes may trigger risk review.
- **RO-18** — Administrative status and risk level are separate.
- **RO-19** — Risk alerts support grouping, priority, deduplication and escalation.
- **RO-20** — AI cannot formally change risk assessment.
- **RO-21** — Automatic risk signals are explainable and traceable.
- **RO-22** — Historical risk, control, assessment and decision state is reconstructable.
- **RO-23** — People are not labeled as “risks”; dependencies/capabilities are modeled instead.
- **RO-24** — Controls may relate to processes, activities and risks.
- **RO-25** — Controls may be manual, automatic or mixed.
- **RO-26** — Control effectiveness is independent from control existence.
- **RO-27** — Incident and Risk are related but different.
- **RO-28** — Risk materialization may trigger reassessment.
- **RO-29** — Risks may close/reopen/supersede without history loss.
- **RO-30** — Quality by Observation generates risk signals.
- **RO-31** — Opportunities may become objectives, initiatives or improvement actions.
- **RO-32** — AI distinguishes signals, patterns, hypotheses and demonstrated causes.
- **RO-33** — Risk/opportunity portfolio feeds management review.
- **RO-34** — Imported historical matrices may preserve incomplete methodology without fabricated data.
- **RO-35** — No artificial annual version is forced for each risk; review depends on methodology, criticality and events.

---

# 14. Nonconformities, findings, actions and improvement — approved AC-01 to AC-35

## 14.1 Transversal Case and Action architecture

Quality uses:

```text
CASE QUALITY
```

as a common management container with semantic specializations.

Possible cases:

- nonconformity;
- audit finding;
- complaint;
- supplier incident;
- nonconforming output;
- deviation;
- other managed issue.

Specializations remain semantically distinct.

## 14.2 Core cycle

```text
SIGNAL / EVENT
→ EVALUATION
→ CONTAINMENT
→ CORRECTION
→ CAUSE ANALYSIS
→ ACTIONS
→ IMPLEMENTATION
→ EFFECTIVENESS
→ CLOSURE
→ LEARNING
```

## 14.3 Distinctions

```text
CONTAINMENT
≠
CORRECTION
≠
CORRECTIVE ACTION
```

Also:

```text
COMPLETED ACTION
≠
CLOSED ACTION
```

## 14.4 Cause analysis

Support multiple methodologies.

Keep distinct:

```text
CAUSAL HYPOTHESIS
≠
VALIDATED CAUSE
```

AI assists but does not determine definitive root cause.

## 14.5 Effectiveness

Where required, the criterion should be defined preferably before closure.

Objective criteria may be observed automatically, but formal effectiveness remains governed by workflow.

## 14.6 Approved decisions

- **AC-01** — One transversal Action Engine exists.
- **AC-02** — Common Quality Case architecture with semantic specializations.
- **AC-03** — Finding and Nonconformity remain distinct.
- **AC-04** — Operational signals do not automatically create NC.
- **AC-05** — Correction and Corrective Action are distinct.
- **AC-06** — Containment, Correction and Corrective Action are distinct.
- **AC-07** — Nonconforming output does not automatically require corrective action.
- **AC-08** — Treatment depth is proportional to risk, recurrence and impact.
- **AC-09** — AI may detect recurrence but formal classification is human.
- **AC-10** — Causal hypothesis and validated cause are distinct.
- **AC-11** — AI does not autonomously determine root cause.
- **AC-12** — An action can have multiple source objects.
- **AC-13** — Completed and Closed are different action states.
- **AC-14** — Actions may observe domain events to update evidence/progress.
- **AC-15** — Extensions preserve original target date.
- **AC-16** — Actions requiring effectiveness can define prior criteria.
- **AC-17** — Negative effectiveness may reopen a case for analysis.
- **AC-18** — Quality may determine closure eligibility; formal closure may remain human.
- **AC-19** — Cases may reopen while preserving prior closure.
- **AC-20** — Improvement may originate without prior NC.
- **AC-21** — Trazaloop Audit and Quality share findings/actions through transversal architecture.
- **AC-22** — Formal decisions are immutable historical events.
- **AC-23** — Alerts support grouping, priority, deduplication and escalation.
- **AC-24** — Objective effectiveness criteria may be evaluated automatically.
- **AC-25** — AI cannot approve cause, effectiveness or closure.
- **AC-26** — Actions may have dependencies and parallel execution.
- **AC-27** — Nonconforming-output correction preserves evidence and disposition.
- **AC-28** — Concessions are formal traceable decisions.
- **AC-29** — Recurrence may raise analysis need without automatic reclassification.
- **AC-30** — Changes caused by actions are executed by owner domains.
- **AC-31** — Imported historical data may be partial without fabricated missing information.
- **AC-32** — Quality may detect systemic patterns across cases.
- **AC-33** — Improvement opportunities may be prioritized and turned into initiatives.
- **AC-34** — Implemented improvements may evaluate realized benefit.
- **AC-35** — This domain feeds management review.

---

# 15. Audits — approved AR-01 to AR-20

## 15.1 Audit architecture

```text
AUDITABLE UNIVERSE
→ AUDIT PROGRAM
→ AUDIT
→ PLAN
→ PREPARATION
→ EXECUTION
→ EVIDENCE
→ FINDINGS
→ REPORT
→ CASES / ACTIONS
→ FOLLOW-UP
```

## 15.2 Program vs audit

Audit Program and Individual Audit are separate.

Audit priority may consider:

- risk;
- performance;
- prior findings;
- changes;
- complaints;
- time since prior audit.

AI may suggest priorities but does not approve the audit program.

## 15.3 Historical criteria

Audits must be able to resolve:

- document revision;
- process revision;
- requirement;

valid for the **audited period**, not only today.

## 15.4 Audit preparation

Quality should automatically prepare:

- process characterization;
- flow;
- current/historical documents;
- recent changes;
- indicators;
- risks;
- suppliers;
- previous NC;
- actions;
- prior audits;
- relevant competence information.

## 15.5 Audit evidence

Prefer references to existing evidence over re-uploading duplicate files.

Private working notes are not the same as formal evidence.

Evidence is not the same as a Finding.

## 15.6 Audit decisions

AI does not autonomously conclude:

- conformity;
- nonconformity;
- severity/classification.

## 15.7 Approved decisions

- **AR-01** — Audit and Management Review are different domains.
- **AR-02** — Quality manages own audits and may register received external audits.
- **AR-03** — Audit Program and Individual Audit are different.
- **AR-04** — Quality may suggest audit priorities based on risk/performance.
- **AR-05** — Audit criteria resolve historical applicability.
- **AR-06** — Quality checks auditor competence, independence and conflicts.
- **AR-07** — Audit preparation dossier is generated automatically.
- **AR-08** — Existing evidence is referenced instead of duplicated where possible.
- **AR-09** — Audit findings use transversal Case/Action architecture.
- **AR-10** — AI does not make formal audit conclusions.
- **AR-11** — Audit report is generated from structured data.
- **AR-12** — Closing an audit does not close derived cases.
- **AR-13** — Trazaloop Audit and Quality share a common audit core/contract.
- **AR-14** — Checklists may be versioned.
- **AR-15** — Working notes, evidence and findings are distinct.
- **AR-16** — Audits may be planned or extraordinary.
- **AR-17** — Auditor may use historically valid information.
- **AR-18** — Quality may detect recurring findings across audits.
- **AR-19** — AI may suggest questions from real process context.
- **AR-20** — Formal audit decisions preserve immutable history.

---

# 16. Management Review — approved RD-01 to RD-20

## 16.1 Management Review is governance, not a PowerPoint

Core cycle:

```text
PREPARE
→ CONSOLIDATE
→ ANALYZE
→ DISCUSS
→ DECIDE
→ ASSIGN
→ FOLLOW UP
```

## 16.2 Inputs

Inputs should be generated primarily from real Quality objects:

- context;
- objectives;
- indicators;
- processes;
- audits;
- customers;
- suppliers;
- risks;
- actions;
- people/competence;
- knowledge;
- documents;
- changes;
- resources.

## 16.3 Dossier and snapshot

Preparation may remain live.

When formal review starts, Quality preserves a snapshot of what was actually presented.

## 16.4 Separate concepts

Keep distinct:

```text
INFORMATION PRESENTED
≠
DISCUSSION
≠
CONCLUSION
≠
DECISION
```

## 16.5 Decisions produce real objects

A management-review decision may generate:

- action;
- change request;
- resource need;
- objective;
- risk decision;
- opportunity.

Decisions must not remain lost inside minutes.

## 16.6 Approved decisions

- **RD-01** — Management Review frequency is configurable.
- **RD-02** — Inputs come primarily from real system objects.
- **RD-03** — Quality generates an automatic pre-review dossier.
- **RD-04** — Review preserves a snapshot of presented inputs.
- **RD-05** — Information, discussion, conclusion and decision remain distinct.
- **RD-06** — Decisions become real system objects.
- **RD-07** — Minutes are generated from structured review data.
- **RD-08** — Closing the session does not close derived actions.
- **RD-09** — Quality by Observation avoids manual recapture.
- **RD-10** — AI does not make formal management decisions.
- **RD-11** — Full, extraordinary and thematic reviews are supported.
- **RD-12** — Previous review commitments automatically appear in later cycles.
- **RD-13** — Decisions may generate actions, changes, resources, objectives, risks or opportunities.
- **RD-14** — People information used in management review is aggregated or strictly necessary.
- **RD-15** — AI inherits review access permissions.
- **RD-16** — Review can explicitly compare current vs prior periods/reviews.
- **RD-17** — Trends take priority over isolated snapshots when series exist.
- **RD-18** — Issued minutes are an immutable controlled document revision.
- **RD-19** — Derived actions use the transversal Action Engine.
- **RD-20** — Quality may detect recurring decisions/themes without effective follow-up.

---

# 17. Transversal automation, alerts and AI — approved AT-01 to AT-45

## 17.1 Core separation

```text
DETERMINISTIC AUTOMATION
≠
ARTIFICIAL INTELLIGENCE
≠
HUMAN DECISION
```

## 17.2 Event engine

Event means:

> Something happened that may be relevant.

Examples:

```text
document.approved
indicator.period_closed
supplier.performance_degraded
complaint.created
risk.review_due
action.overdue
audit.completed
```

Event is not:

- alert;
- task;
- action;
- notification.

Persisted business events are immutable.

## 17.3 Rule engine

Core model:

```text
EVENT / SCHEDULE / CONDITION
→ RULE
→ CONDITIONS
→ RESPONSE
```

Rules must be explainable.

## 17.4 Automation autonomy levels

- **A — Safe automatic**
- **B — Automatic and reversible**
- **C — Automatic preparation + human review**
- **D — Human decision mandatory**

## 17.5 Tasks

Task is operational.

Action is a formal management-system intervention.

All domains should feed a single transversal **My Tasks** experience.

## 17.6 Workflows

Workflow Definition, Workflow Version, Workflow Instance and Task are separate concepts.

Workflow versions are preserved for active instances unless controlled migration occurs.

## 17.7 Alerts

Alert is a persistent attention object with:

- source;
- type;
- severity;
- owner;
- due date;
- status;
- rule;
- expected action;
- history.

Alert lifecycle may include:

```text
NEW
SEEN
ACKNOWLEDGED
IN TREATMENT
RESOLVED
JUSTIFIABLY DISMISSED
```

Alert is different from Notification.

Alerts support:

- deduplication;
- grouping;
- contextual correlation;
- escalation;
- digests.

## 17.8 Quality Copilot

One transversal AI layer with specialized capabilities:

- ISO Navigator;
- Process Assistant;
- Document Assistant;
- Performance Analyst;
- Supplier Analyst;
- Customer Voice Analyst;
- Risk Analyst;
- Root Cause Assistant;
- Audit Assistant;
- Knowledge Assistant;
- Management Review Assistant.

These are capabilities, not disconnected chatbots.

## 17.9 AI authorization

Context is built from:

```text
USER
+
ORGANIZATION
+
PERMISSIONS
+
SCOPE
+
CURRENT OBJECT
+
QUESTION
+
AUTHORIZED DATA
+
TIME CONTEXT
```

Rule:

> If the user cannot see it, the AI cannot use it.

Authorization must apply before/during retrieval, not only after generation.

## 17.10 AI grounding

AI should distinguish:

- registered fact;
- inference/pattern;
- recommendation.

AI responses based on enterprise information should cite/identify sources when technically possible.

## 17.11 AI temporal awareness

AI must resolve:

- historical document revision;
- historical process version;
- historical position assignment;
- historical indicator formula/target;

when a question refers to a past date.

## 17.12 AI limits

AI may:

- search;
- summarize;
- compare;
- classify preliminarily;
- detect patterns;
- create drafts;
- suggest.

AI may propose, with acceptance:

- indicator;
- risk candidate;
- action;
- document change;
- training;
- audit question.

AI does not autonomously:

- approve;
- publish;
- retire;
- suspend supplier;
- close NC;
- accept risk;
- certify conformity;
- make employment decisions.

## 17.13 Deterministic core

Use deterministic logic for:

- calculations;
- permissions;
- state machines;
- deadlines;
- critical rules;
- tenant isolation.

LLMs do not replace transactional logic.

## 17.14 Approved AT decisions

- **AT-01** — Separate deterministic automation, AI and human decision.
- **AT-02** — Event, Alert, Task, Quality Action and Notification are different.
- **AT-03** — Persisted business events are immutable.
- **AT-04** — Module integration favors contracts/events over rigid table coupling.
- **AT-05** — Automated business rules are explainable and auditable.
- **AT-06** — Every automation has an explicit autonomy level.
- **AT-07** — Automations should be idempotent whenever possible.
- **AT-08** — Technical failures are separate from quality/performance events.
- **AT-09** — Operational Task and formal Quality Action are distinct.
- **AT-10** — One transversal task inbox exists.
- **AT-11** — Workflows are versioned.
- **AT-12** — Alerts are persistent objects.
- **AT-13** — Alerts support deduplication, grouping and contextual correlation.
- **AT-14** — Alert and Notification are separate.
- **AT-15** — Command-center priority is explainable.
- **AT-16** — One AI layer with specialized contextual capabilities.
- **AT-17** — AI inherits RLS, permissions and scope.
- **AT-18** — AI enterprise answers are traceable to sources where possible.
- **AT-19** — AI is aware of temporal validity.
- **AT-20** — AI never fabricates evidence or data.
- **AT-21** — AI distinguishes fact, inference and recommendation.
- **AT-22** — AI may create drafts, not silent changes to effective objects.
- **AT-23** — AI does not autonomously perform irreversible/high-impact decisions.
- **AT-24** — AI layer is provider/model independent.
- **AT-25** — Core Quality remains operational without AI availability.
- **AT-26** — Calculations and critical rules are deterministic.
- **AT-27** — Structured facts are retrieved structurally; documents are retrieved as content.
- **AT-28** — Critical AI prompts/instructions are versioned.
- **AT-29** — AI does not issue autonomous certifications/conformity declarations.
- **AT-30** — Deterministic coherence and AI semantic coherence remain distinguishable.
- **AT-31** — AI Insights are distinct from Alerts and official QMS objects.
- **AT-32** — Critical AI capabilities require evaluation before production.
- **AT-33** — Commercial AI entitlements and permissions remain separate.
- **AT-34** — Relevant rules/automations are versioned.
- **AT-35** — MVP uses safe parameterized automations before fully free no-code builder.
- **AT-36** — Retrieved documents are treated as data, not as instructions controlling AI.
- **AT-37** — Reversible automation supports traceable human override.
- **AT-38** — AI can be disabled without disabling core Quality.
- **AT-39** — AI context retrieval follows data minimization.
- **AT-40** — Copilot conversation does not modify QMS without explicit authorized action.
- **AT-41** — Proactive AI has relevance, deduplication and frequency controls.
- **AT-42** — Structural changes may trigger impact analysis but owner domains execute changes.
- **AT-43** — Critical transactional validation and eventually consistent follow-up automation are different.
- **AT-44** — Data is captured once and reused transversally.
- **AT-45** — Automation/AI focus on the system, not invasive employee surveillance.

---

# 18. Coherence Engine

The Coherence Engine is transversal.

It evaluates logical consistency among:

```text
PROCESS MAP
↔ PROCESS
↔ FLOW
↔ PROCEDURE / DOCUMENT
↔ RESPONSIBILITIES
↔ COMPETENCIES
↔ INDICATORS
↔ RISKS
↔ CONTROLS
```

Two modes:

## Deterministic

Examples:

- active process without owner;
- document linked to retired process;
- activity with deleted position;
- indicator with missing source;
- approval using inactive actor.

## AI-assisted semantic

Examples:

- role names appear contradictory across procedure and flow;
- two documents may describe incompatible responsibilities;
- two risks appear duplicative;
- indicator may not logically measure stated objective.

A coherence finding is **not automatically a nonconformity**.

---

# 19. Security and authorization baseline

## 19.1 Multi-tenancy

Tenant isolation is mandatory.

All tenant-owned business entities belong to exactly one organization.

No cross-tenant business relationships unless explicitly designed as global shared data.

## 19.2 Authorization model

```text
AUTHORIZATION
=
ROLE
+
CAPABILITY
+
SCOPE
```

Commercial plan:

```text
Demo / Full / Extra
```

controls entitlement/capacity, not authorization.

## 19.3 Plans

Known commercial model:

- Demo;
- Full;
- Extra.

Full and Extra are functionally equivalent in access, with Extra primarily providing larger storage/capacity.

Do not use plan state as a permission substitute.

## 19.4 Position vs actor

Persistent business responsibility should usually reference a **Position**.

Historical acts must record the actual:

- Person;
- User;
- date/time;
- object/revision.

## 19.5 AI security

AI is never a superuser.

AI retrieval is tenant- and permission-filtered.

Sensitive domains require minimization and restricted scope.

---

# 20. Relational Master Data Model — approved MDR-01 to MDR-50

## 20.1 Core relational principles

- domain-oriented, not clause-oriented;
- reuse platform primitives;
- explicit `organization_id`;
- UUID/internal IDs independent from visible business codes;
- identity + revision for controlled versioned objects;
- append-only histories/events where needed;
- structured FK/bridge relations for critical integrity;
- flexible semantic graph as complement;
- JSONB only where flexibility is appropriate;
- historical reconstruction;
- no duplicated derived master lists;
- no destructive renaming solely for aesthetics.

## 20.2 Common metadata

Applicable tenant-owned entities should conceptually support:

```text
id
organization_id
created_at
created_by
updated_at
updated_by
status
```

`updated_at` is not a substitute for formal history.

## 20.3 Temporal model

Distinguish:

```text
SYSTEM TIME
created_at

BUSINESS VALIDITY
effective_from
effective_to
```

## 20.4 Versioning pattern

```text
IDENTITY
├ REVISION 1
├ REVISION 2
└ REVISION 3
```

Approved/effective revisions are immutable.

## 20.5 Hybrid relational + append-only history

Do not use pure event sourcing for the entire product.

Use:

```text
CURRENT RELATIONAL STATE
+
APPEND-ONLY BUSINESS HISTORY / EVENTS
```

## 20.6 Generic semantic graph

Use a hybrid model:

- strong/critical relationships via normal FK/bridge tables;
- secondary semantic relations via a flexible `quality_relations` equivalent.

Do not put critical ownership/integrity only in the generic graph.

---

# 21. Logical entity inventory

Physical names must be confirmed against the actual repository/schema.

The following is the **logical target universe**, not an instruction to create all tables immediately.

## 21.1 Platform / existing primitives

Reuse real existing equivalents for:

```text
organizations
auth.users
profiles
organization_memberships
plans
subscriptions / entitlements
storage
```

## 21.2 Foundation

```text
quality_external_parties
quality_external_party_roles
quality_external_party_contacts
quality_external_party_sites
quality_relations
quality_evidence_refs
quality_source_links
quality_audit_events
```

## 21.3 Processes

```text
quality_process_maps
quality_process_map_versions
quality_process_map_groups
quality_process_map_nodes

quality_processes
quality_process_versions

quality_process_interactions
quality_process_interaction_items
quality_process_io

quality_process_flows
quality_process_flow_versions
quality_process_stages
quality_process_activities
quality_process_flow_edges
quality_process_decisions
```

## 21.4 Documents

Prefer evolution/reuse of TrazaDocs equivalents.

Logical needs:

```text
document_identities
document_revisions
document_contents
document_files
document_workflows
document_approvals

document_process_links
document_activity_links

document_templates
document_template_revisions

quality_records

external_documents
external_document_versions
```

## 21.5 Organization / people

```text
quality_org_units

quality_positions
quality_position_versions
quality_position_functions
quality_position_assignments

quality_people

quality_competencies
quality_competency_levels
quality_competency_requirements
quality_person_competencies
quality_competency_evidence_links

quality_performance_cycles
quality_performance_evaluations
quality_performance_evaluation_items

quality_development_needs
quality_development_plans
quality_development_plan_items

quality_learning_activities
quality_learning_participants
quality_learning_effectiveness_reviews

quality_knowledge_items
quality_knowledge_holders
quality_knowledge_transfer_plans
quality_knowledge_transfer_items
quality_lessons_learned
```

## 21.6 Strategy / objectives / performance

```text
quality_context_items
quality_interested_parties
quality_interested_party_needs
quality_policies

quality_objectives
quality_objective_periods
quality_objective_links
quality_objective_process_links

quality_indicators
quality_indicator_versions
quality_data_sources
quality_indicator_targets
quality_indicator_measurements
quality_measurement_lineage
quality_performance_events
```

## 21.7 Suppliers

```text
quality_supplier_profiles
quality_supplier_categories
quality_supplier_category_assignments
quality_supplier_scopes
quality_supplier_criticality_assessments
quality_supplier_requirements
quality_supplier_requirement_assignments
quality_supplier_documents
quality_supplier_selection_events
quality_supplier_selection_scores
quality_supplier_approval_decisions
quality_supplier_evaluations
quality_supplier_evaluation_criteria
quality_supplier_evaluation_results
quality_supplier_reevaluations
quality_supplier_incidents
quality_supplier_development_plans
```

## 21.8 Customers / voice

```text
quality_customer_profiles
quality_customer_segments
quality_customer_segment_memberships
quality_customer_voice_programs

quality_survey_templates
quality_survey_template_versions
quality_survey_questions
quality_survey_question_options
quality_survey_campaigns
quality_survey_campaign_audience
quality_survey_responses
quality_survey_answers

quality_satisfaction_methodologies
quality_satisfaction_methodology_versions
quality_satisfaction_results

quality_customer_feedback
quality_customer_case_details
```

## 21.9 Risks / opportunities

```text
quality_risk_methodologies
quality_risk_methodology_versions
quality_risk_scales
quality_risk_scale_levels

quality_risks
quality_risk_causes
quality_risk_consequences
quality_risk_assessments

quality_controls
quality_risk_control_links
quality_control_activity_links
quality_control_effectiveness_reviews

quality_risk_signals
quality_risk_treatment_plans

quality_opportunities
quality_opportunity_assessments
```

## 21.10 Cases / actions / improvement

```text
quality_cases
quality_nonconformity_details
quality_case_requirement_links
quality_case_evidence_links

quality_root_cause_analyses
quality_root_cause_hypotheses
quality_root_causes

quality_actions
quality_action_sources
quality_action_dependencies
quality_action_updates
quality_action_evidence_links
quality_action_effectiveness_reviews

quality_case_events
```

## 21.11 Audits

Prefer a shared Audit/Quality core.

Logical needs:

```text
audit_programs
audits
audit_scopes
audit_criteria
audit_team_members
audit_agenda_items
audit_samples
audit_evidence_links
audit_notes
audit_findings
audit_reports
```

## 21.12 Management Review

```text
quality_management_reviews
quality_management_review_participants
quality_management_review_inputs
quality_management_review_agenda_items
quality_management_review_discussions
quality_management_review_decisions
quality_management_review_decision_links
```

## 21.13 Workflow / tasks

```text
quality_workflow_definitions
quality_workflow_versions
quality_workflow_steps
quality_workflow_transitions
quality_workflow_instances
quality_workflow_instance_steps

quality_tasks
quality_task_events
```

## 21.14 Automation

```text
quality_events

quality_automation_rules
quality_automation_rule_versions
quality_automation_triggers
quality_automation_actions
quality_automation_runs
quality_automation_run_attempts

quality_schedules
```

## 21.15 Alerts / notifications

```text
quality_alerts
quality_alert_events
quality_alert_groups   # only if persistent grouping is justified

quality_notifications
quality_notification_deliveries
quality_notification_preferences
```

## 21.16 Coherence

```text
quality_coherence_rules
quality_coherence_runs
quality_coherence_findings
```

## 21.17 AI

```text
quality_ai_capabilities
quality_ai_org_settings

quality_ai_prompt_definitions
quality_ai_prompt_versions

quality_ai_runs
quality_ai_run_sources
quality_ai_insights
quality_ai_proposals
```

## 21.18 Normative

```text
quality_standards
quality_standard_editions
quality_standard_requirements
quality_requirement_mappings
```

## 21.19 Change

```text
quality_change_requests
quality_change_impacts
```

## 21.20 Retention / configuration

```text
quality_org_settings
quality_retention_policies
quality_disposition_requests
quality_data_classifications
```

---

# 22. Key relational patterns

## 22.1 External Party

```text
external_party
1:N external_party_roles
```

Roles may include:

- supplier;
- customer;
- laboratory;
- contractor;
- consultant;
- certification body.

A single external organization may hold multiple roles.

## 22.2 Process map

```text
process_map
1:N process_map_versions

process_map_version
1:N map_nodes

map_node
N:1 process
```

## 22.3 Process

```text
process
1:N process_versions

process
N:M process
through structured interactions

process
N:M documents
process
N:M indicators
process
N:M risks
process
N:M positions
process
N:M objectives
```

## 22.4 Functional flow

```text
process_flow
1:N flow_versions

flow_version
1:N stages

stage
1:N activities

activity
N:M positions
activity
N:M documents
activity
N:M competencies
activity
N:M risks
activity
N:M controls
activity
N:M indicators
```

Stages are structured entities, not merely visual groups.

## 22.5 Positions and people

```text
position
1:N position_versions

position
1:N historical assignments

person
1:N assignments

person
0..1 user link initially
```

Position assignment must preserve:

- assignment type;
- effective start;
- effective end.

## 22.6 Indicators

```text
indicator
1:N versions

indicator
1:N targets

indicator
1:N measurements

measurement
N:1 indicator_version
measurement
0..1 target
measurement
1:N lineage
```

Corrections preserve the original result.

## 22.7 Supplier scope

Supplier approval/evaluation applies to a logical `supplier_scope` capable of representing:

```text
supplier
+
site
+
category
```

## 22.8 Survey

```text
survey_template
1:N template_versions

template_version
1:N campaigns

campaign
1:N responses

response
1:N answers
```

Anonymous mode must not retain ordinary accessible respondent identity.

## 22.9 Risk

```text
risk
1:N assessments
risk
N:M controls
risk
1:N signals
risk
N:M indicators
risk
N:M actions
```

## 22.10 Case and Action

```text
case
1:N case events
case
0..N root-cause analyses
case
N:M actions

action
N:M source objects
action
1:N updates
action
1:N effectiveness reviews
```

Use supertype + specialization where case types require unique fields.

## 22.11 Audit

```text
audit_program
1:N audits

audit
1:N findings
audit
1:N evidence links

finding
0..1 quality_case
```

A formal audit finding can create/link one Quality Case without duplicating the NC.

## 22.12 Management Review

```text
management_review
1:N inputs
1:N agenda items
1:N decisions

decision
N:M related entities
```

Inputs combine:

- source reference;
- snapshot of what was actually presented.

---

# 23. Evidence architecture

Evidence may point to:

- Storage file;
- controlled document revision;
- record;
- measurement;
- audit object;
- operational event;
- external authorized URL;
- entity in another Trazaloop module.

Use references where possible.

Do not upload another copy if a trustworthy existing object can be referenced.

Evidence engine must preserve:

- organization;
- source;
- object;
- version where applicable;
- access classification;
- history.

---

# 24. Semantic relationship graph

Use a flexible relation structure equivalent to:

```text
quality_relations

id
organization_id

source_type
source_id

relation_type

target_type
target_id

valid_from
valid_to

created_at
created_by
```

Possible relation types:

```text
belongs_to
governs
supports
measures
evidences
supersedes
implements
affects
mitigates
derives_from
responds_to
generates
verifies
occupies
requires
possesses
trained_by
interacts_with
consumes
produces
executed_by
documented_by
controlled_by
supplied_by
delivered_to
```

Critical integrity relations should still use normalized FK/bridge tables.

---

# 25. Formula execution architecture

Human-readable formula and executable formula are separate.

Executable calculation should use a safe, controlled representation such as:

```text
calculation_definition JSONB / DSL
```

It must **not** allow arbitrary tenant SQL execution.

Measurement stores the indicator methodology/version actually used.

---

# 26. Event and automation persistence

## Event

Logical fields:

```text
organization_id
event_type
schema_version
source_type
source_id
occurred_at
payload
dedupe_key
```

Events are append-only.

## Transactional Outbox

For critical business events, implementation should consider:

```text
transaction
→ outbox
→ processor
→ event
```

## Automation run

Preserve:

```text
rule_version
event/trigger
start
end
status
attempts
effects
error
idempotency_key
```

Technical automation failures are separate from Quality business events.

---

# 27. Alert persistence

Logical alert fields:

```text
organization_id
alert_type
severity
source_type
source_id
assigned_position_id
assigned_person_id
due_at
status
rule_version_id
dedupe_key
```

History is append-only through alert events.

A resolved alert remains historically queryable.

---

# 28. AI persistence and governance

## AI run

Preserve when relevant:

```text
organization_id
user_id
capability
provider
model
prompt_version
start/end
status
```

## AI run sources

Preserve source references and source versions.

Do not persist private model chain-of-thought.

Persist only what is needed for:

- auditability;
- sources;
- visible output;
- subsequent authorized actions.

## AI proposal

AI-generated structured data enters as:

```text
PROPOSAL / DRAFT
```

until accepted.

Conversion to formal object records:

```text
proposal
→ created_entity_type
→ created_entity_id
```

---

# 29. Normative data model

Logical model:

```text
quality_standards
→ quality_standard_editions
→ quality_standard_requirements
→ quality_requirement_mappings
```

Mappings may point to:

- process;
- document;
- risk;
- indicator;
- evidence;
- action.

Mapping indicates relationship/coverage, not automatic conformity.

---

# 30. Integration architecture

Quality should not create rigid direct FK dependencies to every PCR/Textiles/ERP/CRM internal table.

Use logical structures equivalent to:

```text
quality_source_links
quality_integration_connections
quality_external_entity_mappings
```

Example:

```text
Quality supplier ABC
↔ ERP vendor 003284
```

Source-of-truth policy can be field-specific.

Example:

ERP governs:

- legal name;
- tax ID.

Quality governs:

- criticality;
- approval;
- evaluation.

---

# 31. Audit trail

Business history and technical audit trail are separate.

Example:

```text
quality_action_events
```

describes business history.

A transversal technical audit event describes:

- actor;
- entity;
- operation;
- timestamp;
- metadata.

Neither replaces the other.

---

# 32. Snapshots

Prefer FK to immutable versions whenever that is sufficient.

Use snapshots only when preserving a multi-source composition is necessary.

Important snapshot use:

- Management Review dossier;
- audit evidence context;
- critical calculation context;
- formally emitted report composition.

---

# 33. Derived views / projections

These must be derived, not manually duplicated.

Examples:

```text
Master Document List
Approved Supplier List
Current Process Map
Process Characterization
Current Position Assignments
Open Actions
Today in Quality / Attention Feed
```

Implementation may choose:

- SQL view;
- materialized view;
- service projection;

according to performance requirements.

---

# 34. Objects explicitly not to create

Do not create persistent duplicate sources such as:

```text
iso_clause_4_data
iso_clause_5_data
iso_clause_6_data

approved_suppliers_excel

process_characterization
# if it duplicates process inputs/outputs/indicators/risks

quality_documents
# if TrazaDocs already contains the reusable identity/revision engine

separate_supplier_master
separate_customer_master
# when both are External Party roles

ai_compliance_result
# automatically declaring ISO compliance
```

---

# 35. Data-model approved decisions MDR-01 to MDR-50

- **MDR-01** — Model is organized by domains, not ISO clauses.
- **MDR-02** — Reuse existing Trazaloop organization/auth/membership/plan/storage primitives.
- **MDR-03** — Relevant tenant-owned tables have explicit `organization_id`.
- **MDR-04** — RLS and functional authorization are different layers.
- **MDR-05** — Business codes are not primary keys.
- **MDR-06** — Historical business objects are not physically deleted.
- **MDR-07** — System creation time and business validity are distinct.
- **MDR-08** — Versionable business objects use identity + immutable revision.
- **MDR-09** — Relational model + append-only history/events; not pure event sourcing.
- **MDR-10** — JSONB does not replace critical normalized relationships.
- **MDR-11** — Suppliers and customers share External Party identity.
- **MDR-12** — Evidence may reference existing objects instead of duplicated files.
- **MDR-13** — Strong normalized relations + flexible semantic graph.
- **MDR-14** — Process stages are structured entities.
- **MDR-15** — Generated records preserve exact template revision FK.
- **MDR-16** — Master Document List is a projection.
- **MDR-17** — Position occupancy is historical assignments, not one mutable person FK.
- **MDR-18** — Configurable formulas use safe representation/DSL, never arbitrary tenant SQL.
- **MDR-19** — Measurement corrections preserve original results.
- **MDR-20** — Supplier approval is modeled through supplier scope.
- **MDR-21** — Anonymous data treatment is reflected structurally.
- **MDR-22** — One transversal Opportunity identity with semantic types.
- **MDR-23** — Cases use supertype + specialization tables when needed.
- **MDR-24** — Actions can have multiple origins through N:M relation.
- **MDR-25** — Audit finding may link directly to one formal Quality Case.
- **MDR-26** — Management Review inputs preserve reference + snapshot.
- **MDR-27** — Workflow, workflow instance and task are different entities.
- **MDR-28** — Critical events should consider Transactional Outbox.
- **MDR-29** — Deterministic and AI-assisted coherence findings preserve detection mode.
- **MDR-30** — AI audit persistence does not store private model reasoning.
- **MDR-31** — ISO standards are a versioned mapping layer.
- **MDR-32** — External/module integration uses mappings/contracts rather than unnecessary duplication.
- **MDR-33** — Persistent responsibility points to Position; historical acts to actual Person/User.
- **MDR-34** — Authorization uses Role + Capability + Scope.
- **MDR-35** — Technical audit trail and business history are separate.
- **MDR-36** — Prefer immutable-version FK over unnecessary snapshots.
- **MDR-37** — Derived views do not duplicate master data.
- **MDR-38** — New Quality tables use consistent naming without destructive aesthetic renaming.
- **MDR-39** — Implementation order follows dependency graph, not menu order.
- **MDR-40** — Relevant structural changes use Change Request + Impact Analysis.
- **MDR-41** — Simple settings and versioned business policies use different persistence patterns.
- **MDR-42** — Tenant-owned relationships must validate same-organization origin and destination.
- **MDR-43** — Published versions preserve references to reviewers/approvers.
- **MDR-44** — Historical entities are queryable by effective date where required.
- **MDR-45** — External systems keep their own IDs; Quality preserves mappings.
- **MDR-46** — Actions, evidence, workflows, events and alerts are transversal and not duplicated by domain.
- **MDR-47** — AI-derived data does not become official without validation where required.
- **MDR-48** — Integration/automation failures persist independently from quality events.
- **MDR-49** — Formal business decisions are append-only or represented by immutable events.
- **MDR-50** — Every later design preserves Zero Duplicate Management and Capture Once, Reuse Many Times.

---

# 36. Implementation dependency order

Do not create the whole logical universe at once.

Use discovery and vertical slices.

## Q0 — Technical Discovery & Schema Mapping

Before implementation:

1. inspect repository;
2. inspect Supabase migrations/schema;
3. map existing auth, organizations, memberships;
4. inspect RLS;
5. inspect TrazaDocs;
6. inspect Trazaloop Audit;
7. inspect evidence/Storage;
8. inspect notifications/tasks/workflow/event primitives;
9. inspect only relevant PCR/Textiles integration points;
10. create exact matrix:

```text
REUSE
EVOLVE
CREATE
ADAPT
DEPRECATE
DEFER
```

No production modification in Q0.

## Logical implementation blocks

### Block 1 — Foundation

- External Party;
- Relations;
- Evidence references;
- Event/audit primitives;
- authorization foundations.

### Block 2 — Processes

- maps;
- processes;
- versions;
- interactions;
- flows;
- stages;
- activities.

### Block 3 — Documents

Evolve TrazaDocs into transversal document engine.

### Block 4 — People / knowledge

- units;
- positions;
- assignments;
- competencies;
- learning;
- knowledge.

### Block 5 — Strategy / performance

- objectives;
- indicators;
- targets;
- measurements;
- sources.

### Block 6 — External parties / suppliers / customers

- supplier lifecycle;
- customer voice;
- surveys;
- complaints.

### Block 7 — Risks

- methodologies;
- risks;
- controls;
- assessments;
- signals;
- opportunities.

### Block 8 — Cases / actions

- cases;
- causal analysis;
- transversal actions;
- effectiveness.

### Block 9 — Audits / Management Review

Shared Audit core + Quality governance layer.

### Block 10 — Automation

- workflow;
- tasks;
- events;
- rules;
- scheduler;
- alerts;
- notifications.

### Block 11 — Coherence / AI

- deterministic coherence;
- AI retrieval;
- AI runs;
- insights;
- proposals.

---

# 37. Vertical-slice implementation rule

Do not create dozens of disconnected tables just because the logical model contains them.

Prefer working end-to-end slices.

Example first useful slice:

```text
ORGANIZATION
→ PROCESS
→ PROCESS MAP
→ OWNER POSITION
→ DOCUMENT RELATION
→ INDICATOR
→ ALERT
```

A slice is accepted only when:

- schema works;
- RLS works;
- server authorization works;
- UI works;
- history/version rules work;
- tests work;
- rollback is understood.

---

# 38. Production and migration rules

All future implementation must preserve:

- append-only migrations;
- explicit rollback strategy where feasible;
- no destructive renaming/removal without dependency analysis;
- RLS verification;
- Storage-policy verification;
- fail-closed authorization;
- tests before production;
- production smoke test;
- no secret exposure;
- no silent cross-tenant data movement.

Production changes require:

```text
IMPLEMENTATION
→ TEST
→ SECURITY CHECK
→ MIGRATION PLAN
→ DEPLOY
→ SMOKE
→ ROLLBACK READINESS
```

---

# 39. Architecture review checklist for every implementation sprint

Before accepting a sprint, verify:

## Multi-tenancy
- Is every tenant-owned entity correctly scoped?
- Are cross-tenant relations impossible?

## Authorization
- Is plan entitlement separate from capability?
- Are role/capability/scope checks fail-closed?

## History
- Is relevant prior state preserved?
- Can historical effective state be reconstructed?

## Versioning
- Are published/approved revisions immutable?

## Duplication
- Is an existing Trazaloop entity being duplicated unnecessarily?

## Evidence
- Is evidence referenced rather than copied where possible?

## Automation
- Are retries idempotent?
- Are technical failures distinct from quality events?

## AI
- Is retrieval permission-filtered?
- Are sources available?
- Does AI write only through explicit authorized flows?
- Is AI being used for a deterministic job that should not use AI?

## UX
- Does the visible ISO navigation remain decoupled from the business model?

---

# 40. Master semantic chain

The intended cross-domain chain is:

```text
STRATEGIC PRIORITY
→ OBJECTIVE
→ PROCESS
→ PROCESS STAGE / ACTIVITY
→ POSITION
→ COMPETENCE
→ DOCUMENT / CONTROL
→ INDICATOR
→ TARGET
→ MEASUREMENT
→ DEVIATION / SIGNAL
→ ANALYSIS
→ RISK / CASE
→ ACTION
→ EVIDENCE
→ EFFECTIVENESS
→ LESSON / IMPROVEMENT
→ MANAGEMENT REVIEW
```

External parties integrate into the same chain:

```text
SUPPLIER
→ INPUT
→ PROCESS
→ OUTPUT
→ CUSTOMER
→ FEEDBACK
```

---

# 41. Example of integrated behavior

Scenario:

```text
Supplier ABC begins to deteriorate.
```

1. ERP provides delayed-delivery data.
2. Quality calculates supplier performance.
3. Performance falls below configured expectation.
4. Deterministic engine creates a performance event.
5. Supplier criticality raises alert priority.
6. Existing risk receives a new signal.
7. Customer feedback also shows delivery complaints.
8. AI identifies a cross-domain pattern.
9. AI recommends risk review; it does not change the risk.
10. Human owner reviews the risk.
11. Treatment creates a formal action.
12. The Action Engine tracks implementation.
13. Supplier alternative is approved.
14. Quality by Observation sees the linked operational effect.
15. Effectiveness criterion is evaluated from indicator data.
16. Human validates formal effectiveness.
17. Management Review automatically receives the episode as a relevant system theme.

This is the target behavior of Trazaloop Quality.

---

# 42. Non-negotiable AI safety/governance matrix

## AI may autonomously

- search authorized information;
- summarize;
- compare;
- explain;
- classify preliminarily;
- detect potential patterns;
- generate draft text;
- prepare review material.

## AI may propose with explicit acceptance

- process draft;
- flow draft;
- indicator draft;
- risk candidate;
- action draft;
- document revision draft;
- training proposal;
- audit question;
- improvement idea.

## AI may not autonomously

- approve documents;
- publish maps/flows;
- suspend suppliers;
- accept risk;
- close NC;
- declare corrective-action effectiveness;
- certify ISO conformity;
- fabricate evidence;
- modify historical records;
- make high-impact employment decisions.

---

# 43. Definition of source of truth

## Structured business truth

PostgreSQL relational model.

## Controlled textual truth

Effective document revisions / controlled external-document references.

## Operational source truth

May remain in:

- PCR;
- Textiles;
- ERP;
- CRM;
- MES;
- HRIS;
- other integrated source.

Quality preserves source mappings and lineage.

## AI output

Never the source of truth by itself.

AI output is:

- explanation;
- draft;
- insight;
- proposal;

until an authorized process converts it into a formal object.

---

# 44. Expected command-center experience

The unified Quality experience should eventually provide:

```text
MY ISO SYSTEM
TODAY IN QUALITY
MY TASKS
ALERTS
QUALITY COPILOT
DOMAINS
```

“Today in Quality” should not show everything.

It should answer:

> What deserves attention now, and why?

Priority must remain explainable.

---

# 45. Final architecture statement

Trazaloop Quality must not become:

> a digital filing cabinet for ISO 9001.

It must become:

> **a structured, historical, automated and intelligent digital representation of the Quality Management System.**

The final governing rule is:

> **PostgreSQL preserves structured reality.  
> The engines automate the system.  
> AI helps understand it.  
> People retain the important decisions.**

And the product-design rule is:

> **Capture once. Reuse many times. Do not make people work for the QMS when the system can observe the operation itself.**

---

# APPENDIX A — Frozen decision register

The following decision families are frozen in this baseline:

```text
DA-01  … DA-33
D-01   … D-30
PC-01  … PC-28
OI-01  … OI-33
GP-01  … GP-33
VC-01  … VC-35
RO-01  … RO-35
AC-01  … AC-35
AR-01  … AR-20
RD-01  … RD-20
AT-01  … AT-45
MDR-01 … MDR-50
```

Any implementation choice that materially contradicts one of these decisions requires an explicit architecture review.

---

# APPENDIX B — Terms that must remain distinct

```text
Navigation ≠ Data Model

Document ≠ File
Document ≠ Template
Template ≠ Record
Record ≠ Evidence

Process ≠ Procedure
Process Map ≠ Functional Flow
Stage ≠ Activity

Position ≠ Person
Person ≠ User
Competence ≠ Performance
Attendance ≠ Learning
Learning ≠ Competence
Competence ≠ Effectiveness

Supplier Category ≠ Supplier Criticality
Selection ≠ Evaluation
Evaluation ≠ Reevaluation
Relationship State ≠ Approval State

Satisfaction ≠ Complaint
Complaint ≠ Nonconformity

Risk ≠ Signal
Risk ≠ Incident
Control ≠ Action
Opportunity ≠ Risk

Finding ≠ Nonconformity
Containment ≠ Correction
Correction ≠ Corrective Action
Completed Action ≠ Closed Action
Causal Hypothesis ≠ Validated Cause

Audit Program ≠ Audit
Audit Closure ≠ Closure of Derived Cases

Management Review Information
≠ Discussion
≠ Conclusion
≠ Decision

Event ≠ Alert
Alert ≠ Notification
Task ≠ Quality Action
Automation ≠ AI
AI ≠ Human Decision

Commercial Plan ≠ Role
Role ≠ Capability
Capability ≠ Scope

Coverage ≠ Conformity
Correlation ≠ Causality
AI Insight ≠ Formal Finding
```

---

# APPENDIX C — Q0 handoff target

The next technical phase is:

```text
SPRINT Q0
TECHNICAL DISCOVERY & SCHEMA MAPPING
```

Q0 should inspect the real `trazaloop2` repository and produce:

1. `Q0_REPOSITORY_DISCOVERY.md`
2. `Q0_DATABASE_SCHEMA_INVENTORY.md`
3. `Q0_QUALITY_SCHEMA_MAPPING.md`
4. `Q0_SECURITY_AND_RLS_REVIEW.md`
5. `Q0_TRAZADOCS_REUSE_ANALYSIS.md`
6. `Q0_AUDIT_REUSE_ANALYSIS.md`
7. `Q0_IMPLEMENTATION_DEPENDENCY_GRAPH.md`
8. `Q0_IMPLEMENTATION_ROADMAP.md`

Q0 must classify each logical target as:

```text
REUSE
EVOLVE
CREATE
ADAPT
DEPRECATE
DEFER
```

Q0 must not modify production.

---

**END OF APPROVED ARCHITECTURE BASELINE v1.0**
