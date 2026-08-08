# The AWS Production Blueprint for Sparstrowgen: A Reusable Architecture for Agent-Built, Agent-Operated Applications (2026)

## TL;DR
- **Build the generic AWS blueprint on a serverless-first core** (CloudFront + OpenNext/Lambda for Next.js, ECS Fargate for long-running services, Aurora Serverless v2 via RDS Proxy, DynamoDB where key-value fits, Cognito, S3+KMS, EventBridge/SQS/Step Functions), treat **HIPAA as a swappable policy overlay** (a dedicated OU + SCPs + KMS-everywhere + BAA-eligible-services allowlist), and use **AWS CDK as the primary IaC tool** with a **CloudFormation change-set + cfn-guard human-approval gate** for agent-authored changes.
- **Run Sparstrowgen externally and have it deploy into AWS via short-lived OIDC-federated roles** (not co-resident in the workload org) for the default posture; the harness control plane stays outside the blast radius of the accounts it mutates, while a thin in-AWS execution plane (Fargate sandboxes + a credential broker) runs the actual coding CLIs. Co-hosting inside AWS is the right call only once you need PHI in agent context or sub-100ms control-plane latency.
- **The 12 agents each get their own IAM role, permission boundary, and MCP server scope**; deploy/release is the only agent allowed to touch production, and even then only through a gated pipeline — no agent ever holds long-lived credentials, and destructive production actions (bucket deletion, DB drops, SCP edits, KMS key deletion) are never autonomous.

## Key Findings

1. **The 2026 AWS agent stack has consolidated.** Bedrock AgentCore went GA on **October 13, 2025** (per AWS "What's New": "Amazon Bedrock AgentCore is now generally available... all AgentCore services now have support for Virtual Private Cloud (VPC), AWS PrivateLink, AWS CloudFormation, and resource tagging") and is now a genuine building block (Runtime, Memory, Gateway, Identity, Code Interpreter, Browser, Observability, plus Policy/Payments/Evaluations). AWS also shipped a managed **AWS MCP Server** (GA May 2026) and an **Agent Toolkit for AWS**. This changes the "build vs. buy" math for Sparstrowgen: you should *consume* AgentCore primitives (Gateway for MCP, Code Interpreter/Browser for sandboxing, Identity for token vending) rather than treat it as a competitor — but keep your own orchestration/memory/policy layer, because AgentCore has documented security sharp edges.
2. **Two services the blueprint must route around:** App Runner moves to maintenance and stops accepting new customers on **April 30, 2026** — per AWS's own product page, "AWS App Runner will no longer accept new customers starting on April 30, 2026... For deploying and running containerized applications, we recommend Amazon ECS Express Mode" (AWS published the service-availability update March 31, 2026); and **CloudTrail Lake stops accepting new customers on May 31, 2026** (AWS points new users to CloudWatch). Do not start new work on either.
3. **Next.js on AWS is a real but sharper-edged experience than Vercel.** Amplify Hosting is the low-ops path but lacks on-demand ISR, streaming, and edge middleware and (per AWS docs mid-2026) still officially supports "up through Next.js 15." OpenNext + SST gives full feature fidelity and lives in your own account (required for HIPAA), at the cost of operational ownership.
4. **HIPAA is genuinely an overlay, not a rebuild.** One self-service BAA in AWS Artifact covers 200+ HIPAA-eligible services; the architecture doesn't change, but the *constraints* do (KMS everywhere, PHI-eligible-services allowlist enforced by SCP, no PHI in logs/traces/analytics/agent context). The same pattern slots in PCI-DSS, SOC 2, and GDPR/residency overlays.
5. **The 2024 HIPAA Security Rule NPRM is still not final as of mid-2026** — build for its likely requirements (mandatory encryption, MFA, annual pen testing) because they're already best practice, but do not treat them as law yet.
6. **AWS is meaningfully cheaper than Vercel/Supabase at scale and meaningfully more expensive in engineering time at the start.** The crossover is real; the report gives thresholds.

## Details

### Decision Summary (read this first)

| Decision | Recommendation | Why |
|---|---|---|
| **Frontend hosting** | OpenNext + SST on Lambda/CloudFront for full-fidelity Next.js; Amplify Hosting only for simple apps that don't need ISR-on-demand/streaming/edge middleware; S3+CloudFront for pure static | Full feature set, code lives in your account (HIPAA prerequisite), no per-seat markup |
| **Primary compute** | Lambda for event/API/short work; **ECS Fargate** (or ECS Express Mode) for long-running/always-on; EKS only if you already run Kubernetes; EC2 only for special hardware | Serverless-first minimizes ops; Fargate covers the >15-min Lambda ceiling |
| **Relational DB** | **Aurora Serverless v2** (PostgreSQL) behind **RDS Proxy**; Aurora DSQL for globally-distributed active-active; DynamoDB where access patterns are key-value | Scales to load, Postgres compatibility, proxy solves serverless connection storms |
| **Harness hosting** | **External control plane + in-AWS execution plane** (hybrid), default | Keeps harness out of workload blast radius; still gets low-latency execution and credential brokering inside AWS |
| **IaC tool** | **AWS CDK** primary; CloudFormation change-sets as the review/approval artifact; cfn-guard for policy-as-code; Terraform/OpenTofu if multi-cloud is a hard requirement | Best agent-authoring ergonomics on AWS-only, native change-set previewability, first-party MCP + training data |
| **Analytics/errors** | Keep a specialized third-party tool (PostHog/Sentry) under its own BAA for product analytics/error tracking; use CloudWatch RUM + Application Signals + X-Ray for AWS-native observability | AWS-native product analytics is a weak substitute; observability is strong |

### 1. Complete AWS service map (2026)

#### Frontend / web hosting

| Option | SSR/ISR/Streaming/Middleware status (2026) | Best for | Key limits |
|---|---|---|---|
| **Amplify Hosting (compute SSR)** | SSR, static, API routes, dynamic routes, SSG, ISR, i18n, middleware, image optimization **supported**; **NOT supported: on-demand ISR, Next.js streaming, edge middleware, `unstable_after`**. Docs state support "up through Next.js 15" as of mid-2026 — re-verify Next.js 16 | Fast, low-ops, Git-based CI/CD, PR previews, teams that don't need cutting-edge Next features | SSR build output capped ~220 MB; max SSR response 5.72 MB (larger → 504); next/image Lambda@Edge path ~1 MB response limit (→503); 25 distributions/account with Lambda@Edge; closed-source |
| **OpenNext + SST (Lambda + CloudFront + S3)** | Full feature fidelity — SSR, on-demand ISR, streaming, middleware, image optimization; you own ISR coordination | AWS-committed teams needing full Next.js features, compliance (code in your account), cost control at scale | Operational responsibility; historically upgrade-fragile (Adapter API + "verified adapter" work in progress in 2026); no dashboard/support contract |
| **ECS Fargate (standalone output)** | Full — it's just a container; no cold starts, always-on | Container teams, always-on perf, max control | You manage the container/ALB (ECS Express Mode reduces this to 3 inputs) |
| **S3 + CloudFront (static export)** | Static only | Fully static sites | No server features |
| **App Runner** | — | **Avoid for new projects** (maintenance April 30, 2026) | Use ECS Express Mode instead |

Recommended progression: start on Amplify or SST; move to SST when you hit on-demand ISR/streaming/edge-middleware needs, when data-transfer becomes a material line item, or when compliance requires the infra in your own account; use ECS Fargate when you already run containers or need always-on with no cold starts.

#### Compute

| Service | Choose when | Cold start / long-run notes |
|---|---|---|
| **Lambda** | Event-driven, APIs, glue, short jobs | Cold starts (mitigate with provisioned concurrency / ARM); **hard 15-min timeout**; as of Aug 2025 AWS bills the INIT phase |
| **ECS Fargate** | Long-running, always-on services, work exceeding Lambda's 15 min | No cold-start once warm; ECS Express Mode = image + 2 roles; deployment circuit breaker for safe rollouts |
| **ECS Express Mode** | Simple web app/API on Fargate, no platform team | Successor to App Runner; provisions ALB/target groups/SGs/autoscaling automatically; can share ALB across up to 25 services |
| **EKS** | You already run Kubernetes / need its ecosystem | Higher operational surface; use for portability |
| **EC2** | Special hardware, licensing, full control | You own patching/scaling |
| **Batch / Fargate tasks / Step Functions** | Long batch, orchestration beyond 15 min | Step Functions for workflow; Fargate tasks for heavy jobs |

#### Database

| Service | Model | Choose when | Notes |
|---|---|---|---|
| **Aurora Serverless v2** | Relational (MySQL/Postgres) | Default relational; variable load | $0.12/ACU-hr, scales (0–256 ACU); **use RDS Proxy** for serverless connection pooling; RDS Proxy for Serverless v2 has an **8-ACU minimum charge** — watch cost on tiny dev clusters; Database Savings Plans (launched re:Invent 2025) give up to 35% off |
| **RDS (provisioned)** | Relational | Steady-state, predictable load; cheaper with Reserved Instances | Multi-AZ, read replicas |
| **Aurora DSQL** | Distributed SQL, Postgres-compatible | Globally distributed, active-active, 99.999% multi-Region | GA May 2025; expanding regions through 2026; FedRAMP Moderate in scope as of July 2026; "4x faster" is a vendor claim |
| **DynamoDB** | NoSQL key-value/document | High-scale key-value, predictable access patterns, serverless-native | Single-digit-ms; DAX for microsecond caching |

Relational-vs-NoSQL guidance: default to Aurora/Postgres for anything with rich query/JOIN/transaction needs; DynamoDB when access patterns are known and key-based and you want zero connection management. From serverless, always front RDS/Aurora with RDS Proxy (Lambda connection storms otherwise exhaust the DB). Use read replicas for read scaling and Multi-AZ for HA.

#### Auth & identity
Cognito user pools (app users) + identity pools (federated AWS access); MFA, social/enterprise federation (SAML/OIDC), hosted UI. Alternatives: third-party IdPs (Auth0/Okta/Clerk/WorkOS) for richer B2B/SSO UX, or self-hosted. Cognito is the AWS-native, BAA-eligible choice; third-party is often better DX for complex B2B. Token handling: short-lived access tokens, rotate refresh tokens, store server-side where possible.

#### Storage & files
S3 with storage classes (Standard → Intelligent-Tiering → Glacier tiers), **presigned URLs** for direct client upload/download, **KMS encryption** (SSE-KMS with CMKs for PHI), lifecycle policies for cost/retention, **S3 Object Lock** (WORM) for immutable audit/backup retention. Macie for PHI/PII discovery.

#### Background jobs / async / workflow
SQS (queues, DLQs), SNS (fan-out/pub-sub), EventBridge (event bus, schedules, cross-account routing), Step Functions (orchestration, human-approval steps, long workflows), Lambda (short work), Fargate tasks/Batch (work exceeding Lambda's 15-min ceiling). Pattern for long work: API → SQS/EventBridge → Step Functions → Fargate task; return a job token and poll/notify via SNS.

#### Realtime
API Gateway WebSockets (bidirectional, connection-oriented), AppSync Events/subscriptions (GraphQL/managed pub-sub, good for app data sync), IoT Core (device-scale MQTT). Choose AppSync for data-model-driven realtime, API Gateway WebSockets for custom protocols, IoT Core for device fleets.

#### Caching & search
ElastiCache (Redis/**Valkey**) for app caching/sessions/rate-limiting; DAX for DynamoDB microsecond reads; OpenSearch for full-text search, log analytics, and vector search.

#### APIs
API Gateway HTTP APIs (cheapest, fast, JWT authorizers) for most REST; API Gateway REST APIs when you need request validation/WAF-per-method/usage plans; ALB for container/long-lived HTTP; AppSync for GraphQL. Default to HTTP APIs; use ALB in front of Fargate.

#### Product analytics & error tracking (the PostHog/Sentry question — honest take)
AWS-native equivalents exist but are a **weaker substitute for a dedicated product-analytics tool**:
- **CloudWatch RUM** — client-side real-user monitoring (page loads, JS errors, Core Web Vitals) — this is real-user perf, not product analytics.
- **CloudWatch Application Signals** — APM/auto-instrumentation (Java/Python/.NET), SLOs, service map.
- **X-Ray** — distributed tracing.
- **Kinesis/Firehose → S3 → Athena/QuickSight** — build-your-own event analytics warehouse. This is the closest AWS-native path to PostHog-style funnels/retention, but it's a data-engineering project, not a product.
- **Amazon Pinpoint** (customer engagement/messaging) — overlaps marketing analytics, not product analytics.

**Recommendation:** For product analytics (funnels, retention, feature flags, session replay) and developer-first error tracking, **keep PostHog and Sentry under their own BAAs** rather than rebuild on AWS primitives. Use CloudWatch RUM + Application Signals + X-Ray for infra/app observability. Both PostHog and Sentry offer BAA-covered plans; both also self-host if you must keep everything in-account.

#### Observability
CloudWatch (logs, metrics, alarms, Logs Insights), X-Ray (tracing), Application Signals (APM + SLOs), Amazon Managed Prometheus + Managed Grafana (open-source-standard metrics/dashboards), OpenTelemetry via ADOT collector. Define SLOs in Application Signals; alarm on SLO burn rate; wire alarms to CodeDeploy for auto-rollback.

#### Secrets & config
Secrets Manager (rotation, cross-account, RDS integration) for credentials; Parameter Store (SSM) for config (cheaper, SecureString for light secrets); KMS CMKs with a key-per-domain strategy (separate keys for PHI, logs, backups) and automatic rotation. Never bake secrets into agent sandboxes — vend at runtime.

#### Networking & edge
VPC with public/private/isolated subnet tiers; NAT for egress from private subnets (or, better, **VPC endpoints / PrivateLink** to reach AWS services without internet); CloudFront (CDN, TLS, edge); Route 53 (DNS, health checks, failover routing); **WAF** (managed rule groups, rate limiting, bot control); **Shield** (Standard free; Advanced for DDoS). For PHI/agent egress control, prefer PrivateLink + no-NAT isolated subnets + egress allowlists.

#### CI/CD
- **GitHub Actions (build/test) + OIDC federation → short-lived IAM role**, then **CodePipeline (deploy)** is the recommended split for AWS-heavy teams. OIDC eliminates long-lived keys; scope the trust policy to specific repo + branch/environment.
- **CodePipeline** wins on IAM-native cross-account deploys, data residency, CodeDeploy blue/green, and native manual-approval actions; **GitHub Actions** wins on iteration speed and the marketplace.
- Progressive delivery: CodeDeploy blue/green + canary (ECS, Lambda), Lambda alias weighted traffic shifting, ECS deployment circuit breaker, CloudWatch-alarm-triggered auto-rollback.
- ECR for images; environment promotion via change-sets and manual-approval gates.

#### AI/ML layer — Bedrock & AgentCore (build vs. buy for Sparstrowgen)
Bedrock AgentCore (GA Oct 13, 2025) is **composable** — you can adopt individual services without adopting the whole platform. Assessment for Sparstrowgen:

| AgentCore service | Use it in Sparstrowgen? | Reasoning |
|---|---|---|
| **Runtime** (8-hr sessions, session isolation, VPC/PrivateLink, A2A) | Optional — competes with your own daemon | If you want managed, isolated agent hosting inside AWS, this is a strong execution-plane option; but it's also where your harness's own value lives |
| **Gateway** (turns APIs/Lambda/MCP servers into agent tools; IAM + OAuth auth) | **Yes** | Best-of-breed managed MCP endpoint + tool auth; reduces custom integration |
| **Identity** (OAuth2/token vending, Secrets Manager ARN refs) | **Yes** | Directly solves credential brokering / short-lived token vending |
| **Code Interpreter / Browser** (sandboxed code/web) | **Cautiously** | Useful sandboxes, but see security caveat below |
| **Memory** (short/long-term, episodic) | Optional — competes with your layered memory | You already have agent/project/workspace memory; AgentCore Memory is a managed alternative, not a must |
| **Observability** | Yes | CloudWatch-backed, OTel-compatible |

**Honest tradeoff / caveat:** A Cloud Security Alliance AI Safety Initiative research note (March 9, 2026) documents that the AgentCore **Code Interpreter has a privilege-escalation path** — verbatim, it permits "any IAM principal holding the `bedrock-agentcore:InvokeCodeInterpreter` permission to execute code under an agent's IAM role, not the caller's own role... AWS has classified this as an expected design behavior rather than a defect." The original disclosures came from Palo Alto Networks Unit 42 ("Agent God Mode," reported to AWS Nov 17, 2025), Sonrai Security, and BeyondTrust (which demonstrated credential exfiltration from the Firecracker microVM metadata service at 169.254.169.254). Treat AgentCore sandboxes as useful but not a security boundary you rely on alone; wrap with tight IAM, egress allowlists, and no-PHI policies. **Net:** AgentCore is a useful *building block* (especially Gateway + Identity), not a competitor to avoid wholesale — but Sparstrowgen's differentiators (layered memory, per-project policy profiles, HITL gates) should stay yours.

### 2. Account & organizational architecture
Use **AWS Organizations + Control Tower** to stand up a landing zone with the standard core accounts: **management**, **log-archive**, **audit/security**, plus workload accounts. Recommended OU/account strategy:
- Separate accounts **per environment per workload** (dev/staging/prod), plus **sandbox** accounts for experimentation, and dedicated **security**, **log-archive**, **shared-services/network**, and **CI/CD** accounts.
- **Service Control Policies (SCPs)** as preventive guardrails (deny region use, deny disabling CloudTrail/GuardDuty, deny non-eligible services in PHI OUs). Per AWS "What's New" (May 15, 2026), AWS doubled SCP limits — "increasing the maximum SCPs per node from 5 to 10 and maximum SCP size from 5,120 to 10,240" — with automatic rollout across commercial, GovCloud, and China regions and no quota request needed. **Resource Control Policies (RCPs)** for org-wide resource perimeters (e.g., deny cross-account S3 access) — note RCPs stayed at 5 attached / 5,120 chars.
- **IAM Identity Center** for human SSO; **cross-account roles** for CI/CD and agent access.
- **Blast-radius containment for agents:** give each environment its own account so a compromised or prompt-injected agent operating on `dev` cannot touch `prod`; put the HIPAA workloads in their own OU with the strictest SCPs; the harness's deploy role assumes into a workload account with a permission boundary, never into the management account.

### 3. Agent access, identity & least privilege (core section)

#### Giving agents AWS identities
- **Never long-lived keys.** Every agent action uses **short-lived STS credentials** vended at runtime. Industry consensus in 2026 (CSA, NIST NCCoE) is that agents are **first-class non-human identities** with **zero standing privilege**, code-bound attestation, and revocation in minutes.
- **OIDC federation from CI** (GitHub Actions → IAM role) for pipeline actions; **IAM Roles Anywhere** for the external harness's own workloads that need AWS access without static keys; **session policies** and **permission boundaries** to cap effective permissions; **SCPs/RCPs** as the org ceiling.
- **2026 agent-specific features:** AgentCore Identity (token vending, Secrets Manager ARN references), AgentCore Gateway IAM authorization for MCP, and the AWS MCP Server's IAM-based guardrails + CloudTrail logging give per-agent auditable access.

#### Per-agent least-privilege mapping (the 12 agents)

| Agent | AWS access (baseline) | Never allowed | Primary MCP servers |
|---|---|---|---|
| **Coordinator** | Read-only orchestration metadata; assume-role to dispatch (no direct resource writes) | Resource mutation, prod | AWS MCP Server (read), Gateway |
| **Product/Requirements** | None/read docs | Any AWS write | Docs/knowledge MCP |
| **Architect** | Read (Config, resource inventory), CDK synth (no deploy) | Deploy, IAM writes | AWS MCP Server, CDK MCP |
| **Frontend builder** | Deploy to dev (Amplify/S3/CloudFront) via pipeline; read staging | Prod deploy, IAM, DB | Amplify/Frontend MCP, ECR |
| **Backend builder** | Deploy Lambda/ECS to dev via pipeline | Prod deploy, IAM writes, KMS admin | Lambda/ECS MCP, AWS MCP |
| **Database builder** | Run migrations in dev/staging via gated task; read schema | Prod migration without approval; drop/delete prod data | RDS/Aurora MCP, migration tool |
| **Test/QA** | Read all envs; ephemeral test resources in dev/sandbox | Prod writes | Test MCP, RUM/Synthetics |
| **Security review** | Read Security Hub, GuardDuty, Config, IAM (read-only) | Any write | Security Hub/GuardDuty MCP |
| **Deploy/Release** | **Only agent allowed to promote to prod — via pipeline manual-approval gate** | Direct prod mutation outside pipeline; SCP/KMS/Org edits | CodePipeline/CodeDeploy MCP |
| **Observability/SRE** | Read CloudWatch/X-Ray/logs; create alarms/dashboards | Delete resources, prod data | CloudWatch/Application Signals MCP |
| **Product strategy** | Read analytics (PostHog/QuickSight) | Any AWS infra write | Analytics MCP |
| **FinOps** | Read **Cost Explorer / Budgets / Cost Anomaly Detection / Pricing** only | Any resource mutation | AWS Billing MCP, Price List MCP |

#### Preventing privilege escalation & confused deputy
- Deny `iam:*` (create/attach policy, pass-role to broad roles) in agent permission boundaries; require `iam:PassRole` be scoped to specific roles via condition.
- **External IDs** on cross-account assume-role trust policies (defeats confused-deputy).
- **ABAC / tag-scoping**: agents can only act on resources tagged with their project/environment; enforce via `aws:ResourceTag` conditions.
- Sub-agent credentials must be **scoped more narrowly than the parent's, never equal**.

#### Keeping credentials out of sandboxes
Use a **credential broker / token-vending proxy**: the sandbox never sees static keys; it requests a short-lived, task-scoped token from the broker (AgentCore Identity or a custom STS vendor), which expires when the task completes. This is the single highest-leverage control.

#### Sandboxing agent execution
Options, roughly increasing isolation: Lambda (ephemeral, 15-min cap), **Fargate** (container isolation, good default for coding CLIs), **Firecracker/microVMs** (strongest isolation; what AgentCore Code Interpreter uses under the hood), EC2 (full control), AgentCore Code Interpreter/Browser (managed but see the CSA caveat), or third-party sandbox providers (e.g., E2B-style). **Network egress control is mandatory:** run sandboxes in isolated subnets with an egress allowlist (proxy or VPC endpoints only) so a prompt-injected agent cannot exfiltrate to an arbitrary host.

#### Auditing agent actions
- **CloudTrail** (org trail → log-archive account) for every API call; **note CloudTrail Lake closes to new customers May 31, 2026** — use CloudTrail trails + CloudWatch/OpenSearch/Athena or a SIEM instead.
- **Config** (resource config history + rules), **Security Hub** (findings aggregation), **GuardDuty** (threat detection), **Macie** (PHI/PII discovery in S3).
- **Attribution:** because each agent has its own IAM role and session name, CloudTrail's `userIdentity` + `sessionContext` attributes every action to a specific agent identity and session. Enforce meaningful STS session names (agent id + task id).

#### Guardrails against prompt-injection-driven AWS actions
Real, demonstrated threat: a Synack red-team engagement showed a single crafted prompt bypassing Bedrock content moderation and a Lambda regex filter to **exfiltrate S3 data**; researchers have also demonstrated **persistent memory poisoning** of Bedrock Agents. Layered defense:
1. **Least-privilege IAM with no wildcards** — the agent simply cannot delete the bucket or read the PHI store because its role forbids it. This is the real backstop, not the model.
2. **Human approval for mutating/high-risk actions** (Bedrock Agent action-group user confirmation; Sparstrowgen HITL gates).
3. **Bedrock Guardrails** on inputs/outputs (prompt-attack filters High; PII BLOCK/ANONYMIZE across 50+ entity types), tagging all RAG/tool content as untrusted user input with unique per-request tag suffixes.
4. **Egress allowlisting** so exfiltration has nowhere to go.
5. **Output validation against allowlists** before any backend action runs.

### 4. Agent-driven deployment automation

#### How the deploy/release agent should promote changes
Pipeline: **GitHub Actions builds/tests → pushes image to ECR (OIDC, no keys) → EventBridge on ECR PutImage triggers CodePipeline → CodePipeline runs cfn-guard/policy checks → CloudFormation change-set is generated → manual approval action (CodePipeline) / GitHub Environments required-reviewers → deploy → CodeDeploy canary → CloudWatch-alarm auto-rollback.** The agent authors the change and can advance non-prod stages autonomously; **prod promotion requires a human approval action**. The change-set (or `terraform plan`) is the human-reviewable diff.

#### What must never be autonomous vs. safe to automate
- **Never autonomous:** production deploys, SCP/RCP/Org changes, IAM policy changes granting privilege, KMS key deletion/policy changes, prod database destructive migrations, S3 bucket/Object-Lock deletion, disabling CloudTrail/GuardDuty/Config.
- **Safe to automate:** dev/staging deploys, running the test suite, creating ephemeral test resources, opening PRs, generating change-sets, creating dashboards/alarms, non-prod migrations, cost reporting.

#### Progressive delivery & automated rollback
- **CodeDeploy blue/green + canary** for ECS and Lambda; **Lambda alias weighted traffic shifting** (e.g., Linear10PercentEvery1Minute or Canary10Percent) with a **CloudWatch alarm** that triggers instant rollback to 100% old version on error/latency breach.
- **ECS deployment circuit breaker** auto-rolls-back failed rollouts.
- Always attach alarms; keep recent stable versions; test rollback in non-prod.

#### Database migration safety
Run migrations from a **gated CI/CD task** (Fargate task or CodeBuild) with least-privilege DB creds vended at runtime — not from the app or an agent shell. Gate prod migrations behind manual approval. Use **expand/contract (zero-downtime) patterns**: additive changes first, backfill, switch reads, then remove old columns in a later deploy. **Verify backups before destructive migrations** (AWS Backup restore test / snapshot).

#### Drift detection & reconciliation
CloudFormation drift detection (and `terraform plan`/`cdk diff`) on a schedule; alert on drift; reconcile by re-applying IaC or importing manual changes. Because both humans and agents change infra, make IaC the source of truth and treat console changes as drift to be reconciled or codified.

#### Policy-as-code in the pipeline
- **cfn-guard** (Guard DSL) + **CloudFormation Hooks** (Guard Hooks, GA'd via Cloud Control API) to block non-compliant resources at deploy time (e.g., "all S3 buckets encrypted," "no public buckets," "KMS on all PHI stores"). Guard Hooks also validate Terraform (via AWS Cloud Control provider) and Pulumi.
- **Checkov, tfsec/Trivy, OPA/Conftest** for Terraform/K8s; **Terraform Sentinel** (Terraform Cloud) for enterprise policy.
- Run policy checks at pre-commit, PR, and pipeline stages ("shift left") so agent-authored IaC is validated before it can apply.

### IaC tool comparison (weighted for AI-agent authoring)

| Criterion (agent-weighted) | CDK | Terraform/OpenTofu | SST | OpenNext | CloudFormation | Pulumi |
|---|---|---|---|---|---|---|
| **Verbosity / determinism for agents** | Concise (TS/Py), high-level constructs; synth is deterministic | HCL declarative, verbose but very predictable | Concise, Next-focused | Not general IaC (build adapter) | Very verbose YAML/JSON, fully deterministic | Concise, general-purpose langs |
| **Plan/diff reviewability** | `cdk diff` + CloudFormation change-set (strong) | `terraform plan` (gold standard) | Uses CFN change-sets | n/a | Change-sets (native) | `pulumi preview` |
| **Blast-radius previewability** | Change-set shows exact resource deltas | Plan shows deltas | via CFN | n/a | Native change-sets | Preview |
| **Policy-as-code** | cfn-guard + Hooks (native) | Sentinel/OPA/Checkov | via CFN | n/a | cfn-guard + Hooks | CrossGuard/OPA |
| **Drift detection** | CFN drift | Strong (plan) | CFN drift | n/a | CFN drift | Pulumi refresh |
| **Training data + MCP for agents** | Excellent (AWS MCP + CDK MCP, huge corpus) | Excellent (largest corpus, AWSCC + Guard Hooks) | Good | Limited | Good | Moderate |
| **Human-approval gating of agent changes** | Change-set = clean approval artifact | Plan artifact = clean approval | via CFN | n/a | Change-set | Preview artifact |
| **AWS-only fit** | Best | Good | Best for Next | Next-only | Native | Good |

**Recommendation: AWS CDK as primary**, because for an AWS-only, agent-authored blueprint it gives the best combination of concise agent-writable code, first-party MCP servers and training data, and — critically — **CloudFormation change-sets as a clean, deterministic human-approval artifact** that gates agent-generated changes. Use **cfn-guard + CloudFormation Hooks** for policy-as-code. Choose **Terraform/OpenTofu** instead only if multi-cloud or a large existing HCL module ecosystem is a hard requirement (its `terraform plan` is the gold standard for reviewability, and OpenTofu resolves the licensing concern). Avoid raw CloudFormation for agent authoring (too verbose) and treat SST/OpenNext as the *frontend* deployment layer that sits inside your CDK-managed accounts.

### 5. HIPAA overlay (applied on top of the generic blueprint)

#### The BAA
AWS offers a **standard BAA at no extra charge**, accepted **self-service in AWS Artifact** (account-wide or org-wide, must be accepted by an authorized signer, and **before any PHI lands**). It defines AWS's obligations as a business associate (safeguards, breach notification, limits on use/disclosure). "One BAA covers all HIPAA-eligible services" is true in the sense that the single agreement scopes all eligible services — but **only** HIPAA-eligible services may touch PHI, and some eligible services have **feature-level exclusions** (e.g., CloudFront excludes Embedded PoP delivery; Directory Service excludes Simple AD). Everything else (configuration, encryption, access control, logging) remains the customer's responsibility under the shared-responsibility model.

#### HIPAA-eligible services
As of 2026 the list exceeds **200 services** and is updated roughly monthly. Per HIPAA Compliant Hosting (July 2026), "AWS HIPAA eligible services now number over 200... the current version is dated July 22, 2026," and an earlier Feb 10, 2026 update added Bedrock and AgentCore (per Paubox). **Check the published "HIPAA Eligible Services Reference" before standing up any new service for PHI.** If a needed service is *not* eligible: don't put PHI through it (keep it out of the PHI data path), find an eligible alternative, or wait for eligibility. Enforce this with an **SCP in the HIPAA OU** that denies non-eligible services.

#### Technical safeguards → AWS controls

| HIPAA safeguard | AWS control |
|---|---|
| Encryption at rest | KMS (SSE-KMS/CMK) on S3, RDS/Aurora, DynamoDB, EBS, backups |
| Encryption in transit | TLS everywhere; ACM certs; enforce HTTPS via CloudFront/ALB/API Gateway; deny non-TLS via bucket policy |
| Access controls | IAM least-privilege, SCPs, permission boundaries, Cognito, MFA |
| Audit controls | CloudTrail (org trail → log-archive), CloudWatch Logs, Config |
| Integrity controls | S3 Object Lock (WORM), versioning, checksums, KMS |
| Transmission security | TLS, PrivateLink/VPC endpoints (avoid public internet for PHI) |
| Automatic logoff | Cognito/session token expiry; short STS sessions |
| Unique user identification | IAM Identity Center, per-user/per-agent identities |

#### Keeping PHI out of logs/traces/analytics — and out of agent context
This is where HIPAA most constrains the *agent* design:
- Scrub PHI before it reaches CloudWatch logs, X-Ray traces, error reports (Sentry), and product analytics (PostHog). Use structured logging with field allowlists; Bedrock Guardrails PII ANONYMIZE; Macie to detect leaks.
- **Agents must not read production PHI.** The database-builder and SRE agents get access to schema/metrics but not PHI rows; production data used for agent context must be de-identified/synthetic. This means **agent context windows never contain PHI** — enforce via IAM (no read on PHI stores from agent roles) and data-tier separation.

#### Backup, retention, DR, lifecycle
AWS Backup (centralized, cross-region copy, backup vault with Vault Lock/WORM), retention policies aligned to the 6-year HIPAA documentation requirement, cross-region DR with defined RTO/RPO, S3 lifecycle + Object Lock for immutable retention, and tested restores (verify backups before destructive changes).

#### 2026 regulatory status (verify before implementation)
The **HIPAA Security Rule NPRM** (published in the Federal Register Jan 6, 2025; comment period closed Mar 7, 2025) proposes **mandatory encryption of ePHI at rest and in transit (removing "addressable"), mandatory MFA, 72-hour incident reporting, annual penetration testing, and vulnerability scanning every 6 months**. As of mid-2026 it **remains proposed, not final**: per Fierce Healthcare (2026), "HHS had proposed a May 2026 release for a final rule... the final rule was pushed back to July 2027," and OCR "received nearly 5,000 comments on the proposed rule" (RIN 0945-AA22 moved to OMB's Long-Term Actions agenda). It could be finalized, modified, delayed, or withdrawn. OCR's own regulatory impact analysis estimated ~$9B first-year compliance cost. **Recommendation:** build to these requirements now (they're best practice and cheap to adopt in a greenfield AWS design) but don't represent them as current law.

#### Where third-party tools still make sense under their own BAAs
PostHog (product analytics), Sentry (error tracking), Auth0/Okta/WorkOS (identity), Datadog (observability) — each can sign its own BAA. Keep them if their DX materially beats the AWS-native substitute, but confirm the BAA and ensure PHI is scrubbed before it reaches them.

#### Other overlays (same pattern)
- **PCI-DSS:** dedicated OU/account for the cardholder-data environment, network segmentation, WAF, tokenization, restricted SCPs, quarterly scans.
- **SOC 2:** Config rules + Security Hub standards + Audit Manager evidence collection; mostly a controls-evidence overlay, minimal architecture change.
- **GDPR / data residency:** region-locking via SCP (`aws:RequestedRegion` deny), EU-only KMS keys, data-subject-request tooling, DPA with AWS.

### 6. Cost

#### Cost model & drivers by scale (order-of-magnitude, us-east-1)
- **Small (MVP, <10K users):** Lambda + HTTP API (near-free at low volume; free tier 1M requests + 400K GB-s/mo), Aurora Serverless v2 (watch the RDS Proxy 8-ACU minimum on tiny clusters — provisioned RDS t4g.micro at ~$12/mo can be cheaper), S3+CloudFront, Cognito. Realistically low tens of dollars/month, but with more moving parts than a $45–95/mo Vercel+Supabase setup.
- **Medium:** Fargate services, Aurora Serverless v2 at steady ACUs, ElastiCache, WAF, multi-account overhead. AWS and Vercel/Supabase converge here.
- **Large:** AWS pulls clearly ahead on unit economics with Savings Plans/Reserved Instances and raw compute, especially on data transfer (CloudFront vs. Vercel's ~1.75× bandwidth markup on overage). Bytebase's 2026 analysis states verbatim: "A growing business at 100K MAUs pays ~$630/month on Supabase vs ~$3,180/month on AWS. However, at hyperscale (10M+ MAUs), Supabase hits architectural limits and AWS becomes more viable." That comparison reflects the managed-convenience tier and understates the ops cost of Supabase's simplicity — but it captures the real crossover shape.

Key drivers to watch: **data transfer/egress**, NAT gateway hours, Aurora ACU-hours + RDS Proxy minimums, Lambda GB-seconds, CloudWatch logs ingestion, and cross-AZ traffic.

#### Cost management tooling (what the FinOps agent consumes)
Cost Explorer (analysis + RI/SP recommendations), AWS Budgets (alerts), Cost Anomaly Detection (ML-based spend spikes), a mandatory **tagging strategy** (project/env/owner/cost-center enforced by SCP/Config), Compute Savings Plans / Reserved Instances / Database Savings Plans (up to 35% on Aurora Serverless v2). The FinOps agent reads Cost Explorer + Budgets + Pricing via the **AWS Billing MCP and Price List MCP** (read-only), flags anomalies, and recommends (never applies) RIs/SPs.

#### Cost of running the harness itself
Two components: **sandbox compute** and **LLM inference**.
- **Sandbox compute (per active agent session):**
  - **Fargate**: ~$0.04048/vCPU-hour + ~$0.004445/GB-hour (us-east-1 on-demand, standard published rates) — cheapest for sustained sandboxes.
  - **Lambda**: $0.20/million requests + $0.0000166667/GB-second (x86; ARM ~20% less) — cheapest for short bursts.
  - **AgentCore Runtime/Code Interpreter/Browser** (AWS-self-reported from the AgentCore pricing page): $0.0895/vCPU-hour + $0.00945/GB-hour, billed per second with a 128 MB memory minimum and **no CPU charge during I/O wait** — i.e., ~2.2× Fargate's vCPU rate and ~2.1× its memory rate, but you only pay for active CPU. AgentCore is cost-competitive for bursty, I/O-heavy agent workloads and more expensive for sustained compute.
  - **AgentCore Memory**: $0.25/1,000 short-term events; $0.75 (built-in) or $0.25 (self-managed)/1,000 long-term records/month; $0.50/1,000 retrievals.
  - **AgentCore Gateway**: $0.005/1,000 tool invocations; **Identity**: $0.010/1,000 token requests (free via Runtime/Gateway).
- **LLM inference** is typically the dominant harness cost — model token spend for the 12 agents dwarfs sandbox compute for most projects. Budget and monitor it explicitly (Bedrock model invocation logging + Cost Explorer).

### 7. Comparison back to Vercel/Supabase

| Dimension | AWS | Vercel + Supabase |
|---|---|---|
| **Developer velocity** | Slower to start; more primitives; steeper curve | Fastest; git-push, batteries-included; RLS, auth, storage bundled |
| **Operational burden** | Higher (you own the landing zone, VPC, IaC) | Very low; managed |
| **Compliance posture** | Strongest; BAA, 200+ eligible services, full control, PHI in your account | Supabase/Vercel offer BAAs on higher tiers but less granular control |
| **Cost at scale** | Cheaper (RIs/SPs, CloudFront egress) | Cheaper at small scale; bandwidth/compute markups bite at scale |
| **Lock-in** | AWS-wide but IaC-portable; OpenNext avoids Vercel-specific lock-in | Vercel edge/ISR features and Supabase conveniences are stickier |
| **Right choice when** | Compliance, scale, multi-account governance, agent blast-radius control | Speed to MVP, small teams, standard SaaS without heavy compliance |

**What's genuinely lost leaving Vercel/Supabase:** Vercel's zero-config edge network, instant preview deployments, and best-in-class Next.js DX; Supabase's bundled Postgres + instant REST/GraphQL + Row-Level-Security + auth + realtime + Studio in one predictable bill. Reproducing these on AWS is possible (OpenNext, Cognito, Aurora, AppSync, Amplify previews) but takes real engineering. Recommendation: **prototype on Vercel/Supabase; move to AWS when compliance (HIPAA), scale economics, or agent-governance requirements cross the threshold** — which for Sparstrowgen's target use case (compliance-sensitive, agent-operated) is early.

### 8. The AWS `blueprint.yaml`

```yaml
# .sparstrowgen/blueprint.yaml — AWS generic production blueprint (baseline)
project:
  name: acme-app
  org: acme
  aws:
    org_management_account: "1111-mgmt"
    accounts:
      dev:      "2222-dev"
      staging:  "3333-staging"
      prod:     "4444-prod"
      security: "5555-security"
      log_archive: "6666-logs"
      shared:   "7777-shared"
    default_region: us-east-1
    control_tower: true

stack:
  frontend:
    hosting: opennext-sst        # alt: amplify | s3-cloudfront | ecs-fargate
    cdn: cloudfront
    waf: true
  compute:
    api: apigw-http
    functions: lambda
    services: ecs-fargate         # alt: ecs-express
  database:
    engine: aurora-serverless-v2  # postgres
    connection_proxy: rds-proxy
    nosql: dynamodb               # where key-value fits
    multi_az: true
  auth:
    provider: cognito             # alt: auth0 | workos
    mfa: required
  storage:
    bucket_encryption: sse-kms
    object_lock: false
  async:
    queue: sqs
    bus: eventbridge
    workflow: step-functions
  cache: elasticache-valkey
  search: opensearch              # optional
  secrets:
    store: secrets-manager
    config: ssm-parameter-store
    kms_strategy: key-per-domain

iac:
  tool: aws-cdk                   # primary
  language: typescript
  policy_as_code: [cfn-guard, cloudformation-hooks]
  approval_artifact: cloudformation-change-set

commands:
  synth:    "cdk synth"
  diff:     "cdk diff"
  test:     "npm test && cdk synth"
  deploy_dev:     "cdk deploy --require-approval never --context env=dev"
  deploy_prod:    "gated: codepipeline manual-approval"   # never autonomous
  migrate_dev:    "task run migrate --env dev"
  migrate_prod:   "gated: manual-approval + backup-verify"

cicd:
  build: github-actions
  auth_to_aws: oidc-federation    # no long-lived keys
  deploy: codepipeline
  progressive_delivery: codedeploy-canary
  auto_rollback: cloudwatch-alarm
  registry: ecr

observability:
  logs: cloudwatch
  tracing: xray
  apm: application-signals
  rum: cloudwatch-rum
  metrics: managed-prometheus     # optional
  dashboards: managed-grafana     # optional
  slos: application-signals
  product_analytics: posthog      # third-party (own BAA if PHI)
  error_tracking: sentry          # third-party (own BAA if PHI)

policy_profile: baseline          # see hipaa variant below

audit:
  cloudtrail: org-trail
  config: true
  security_hub: true
  guardduty: true
  macie: false
  log_destination: log_archive_account

mcp_servers:
  - aws-mcp-server                # managed, IAM-guarded, CloudTrail-logged
  - aws-cdk-mcp
  - aws-pricing-mcp
  - aws-lambda-mcp
  - aws-ecs-mcp
  - aws-rds-mcp
  - cloudwatch-mcp
  - security-hub-mcp

agents:                           # per-agent role + permission boundary + MCP scope
  coordinator:      { role: sg-coordinator, boundary: pb-readonly, mcp: [aws-mcp-server], prod: deny }
  requirements:     { role: sg-requirements, boundary: pb-none, mcp: [], prod: deny }
  architect:        { role: sg-architect, boundary: pb-read-synth, mcp: [aws-mcp-server, aws-cdk-mcp], prod: deny }
  frontend_builder: { role: sg-frontend, boundary: pb-dev-deploy, mcp: [aws-ecs-mcp], prod: deny }
  backend_builder:  { role: sg-backend, boundary: pb-dev-deploy, mcp: [aws-lambda-mcp, aws-ecs-mcp], prod: deny }
  database_builder: { role: sg-db, boundary: pb-migrate-nonprod, mcp: [aws-rds-mcp], prod: deny }
  test_qa:          { role: sg-qa, boundary: pb-read-ephemeral, mcp: [cloudwatch-mcp], prod: deny }
  security_review:  { role: sg-sec, boundary: pb-security-read, mcp: [security-hub-mcp], prod: deny }
  deploy_release:   { role: sg-deploy, boundary: pb-pipeline-only, mcp: [aws-mcp-server], prod: gated-approval }
  observability_sre:{ role: sg-sre, boundary: pb-observe, mcp: [cloudwatch-mcp], prod: read }
  product_strategy: { role: sg-strategy, boundary: pb-analytics-read, mcp: [], prod: deny }
  finops:           { role: sg-finops, boundary: pb-billing-read, mcp: [aws-pricing-mcp], prod: deny }

credential_broker:
  mode: short-lived-sts           # no static keys in sandboxes
  vendor: agentcore-identity      # alt: custom-sts-vendor
  session_naming: "{agent_id}:{task_id}"

sandbox:
  runtime: fargate                # alt: agentcore-code-interpreter | lambda
  network: isolated-subnet
  egress: allowlist-only
```

```yaml
# --- HIPAA POLICY OVERLAY (diff vs baseline) ---
policy_profile: hipaa
hipaa_overlay:
  baa: accepted-in-artifact       # prerequisite, before any PHI
  dedicated_ou: hipaa-workloads
  scp:
    - deny-non-hipaa-eligible-services
    - deny-region-except: [us-east-1, us-east-2]   # residency
    - deny-disable: [cloudtrail, guardduty, config]
    - deny-unencrypted-storage
  changes:
    storage.bucket_encryption: sse-kms-cmk         # customer-managed keys
    storage.object_lock: true                      # WORM
    database.encryption: kms-cmk
    secrets.kms_strategy: key-per-domain-phi-isolated
    network.egress: privatelink-no-nat             # PHI never on public internet
    auth.mfa: enforced-all
    audit.macie: true                              # PHI discovery
    backup:
      service: aws-backup
      vault_lock: true
      cross_region: true
      retention_years: 6
  agent_constraints:
    production_phi_access: deny-all                 # no agent reads PHI rows
    agent_context_phi: forbidden                    # PHI never in context windows
    nonprod_data: de-identified-or-synthetic
  logging:
    phi_scrubbing: enforced                          # logs/traces/errors/analytics
    guardrails_pii: block-or-anonymize
  third_party_baa_required: [posthog, sentry, datadog, auth0]
```

## Recommendations (staged rollout with thresholds)

**Stage 0 — Foundation (before any workload).** Stand up Organizations + Control Tower landing zone (management, log-archive, security, dev/staging/prod accounts). Enable org CloudTrail, Config, Security Hub, GuardDuty. Baseline SCPs. IAM Identity Center for humans. Accept the AWS BAA now if HIPAA is even possible (it's free and account-wide). *Move to Stage 1 when the landing zone passes a Well-Architected/Security Hub baseline.*

**Stage 1 — Generic blueprint, dev only.** Deploy the baseline `blueprint.yaml` (CDK) into dev. Wire GitHub Actions + OIDC + CodePipeline with cfn-guard gates. Give agents dev-only roles with permission boundaries and the credential broker. Let agents build and deploy to dev autonomously. *Threshold to Stage 2: green pipeline, cfn-guard passing, agent actions cleanly attributed in CloudTrail.*

**Stage 2 — Staging + prod with human gates.** Add staging/prod accounts, CodeDeploy canary + alarm rollback, manual-approval action for prod. Deploy/release agent may promote to prod only through the gate. Turn on Cost Budgets + Anomaly Detection; FinOps agent begins read-only reporting. *Threshold to Stage 3: two clean canary deploys with successful auto-rollback tests; DR restore verified.*

**Stage 3 — Apply the compliance overlay.** Switch `policy_profile: hipaa` (or pci/soc2/gdpr): dedicated OU, CMK-everywhere, Object Lock, PrivateLink-no-NAT, Macie, AWS Backup Vault Lock, PHI-scrubbing, agent-PHI-deny. Engage a third-party HIPAA assessor. Keep PostHog/Sentry only under signed BAAs. *Threshold to scale-up: passing compliance audit + no PHI detected by Macie in logs/analytics.*

**Stage 4 — Scale economics.** Once spend is steady, buy Compute/Database Savings Plans and RIs (FinOps agent recommends, human approves). Re-evaluate Aurora provisioned vs. Serverless v2 and Amplify vs. SST as line items grow.

**Benchmarks that change the plan:** if data-transfer or SSR bill on Amplify becomes material → move to SST; if you need PHI in agent context or sub-100ms control-plane latency → co-host the harness inside AWS; if you go multi-cloud → switch IaC to Terraform/OpenTofu; if agent volume explodes and sandboxes are bursty/I-O-heavy → evaluate AgentCore Runtime vs. Fargate on the per-second billing math.

## Caveats & open decisions

**Open decisions for the person:**
1. **Harness hosting** — confirm the hybrid (external control plane + in-AWS execution) vs. fully in-AWS, based on whether agents will ever need PHI-adjacent context and your latency tolerance.
2. **AgentCore adoption depth** — decide which AgentCore services to consume (recommended: Gateway + Identity) vs. keep in Sparstrowgen (recommended: memory, policy, orchestration, HITL).
3. **Cognito vs. third-party IdP** — Cognito for AWS-native/BAA simplicity vs. Auth0/WorkOS for B2B DX.
4. **Aurora Serverless v2 vs. provisioned vs. DSQL** — depends on load shape and whether you need multi-region active-active.
5. **CDK vs. Terraform** — CDK recommended unless multi-cloud becomes a hard requirement.

**Known limitations / verify-before-implementation:**
- **HIPAA-eligible services list changes ~monthly** — re-verify every service in the PHI data path before deploying (list was updated Feb 10 and again ~July 22, 2026).
- **The HIPAA Security Rule NPRM is not final** (mid-2026; final action reportedly pushed to July 2027); requirements/timing may change.
- **AgentCore Code Interpreter has a documented privilege-escalation design and a demonstrated credential-exfiltration path** (CSA/Unit 42/BeyondTrust, Nov 2025–March 2026) — do not treat its sandbox as a sole security boundary.
- **App Runner (April 30, 2026) and CloudTrail Lake (May 31, 2026) are closing to new customers** — use ECS Express Mode and CloudTrail/CloudWatch respectively.
- **Amplify's Next.js support** officially reads "up through Next.js 15" as of mid-2026 — verify Next.js 16 before relying on it.
- **Fargate/Lambda rates cited are us-east-1 standard published rates** (third-party-corroborated); AgentCore rates are AWS-self-reported from the AgentCore pricing page — verify current pricing pages before budgeting.
- **Vendor self-reported vs. independent:** AgentCore capabilities/pricing, Aurora DSQL performance ("4x faster"), and Amplify feature lists are **vendor claims**; the App Runner/CloudTrail Lake deprecations, SCP limit increase (May 15, 2026), HIPAA NPRM status, and the AgentCore security findings are **independently verifiable** (AWS docs, Federal Register/Fierce Healthcare, CSA/Unit 42).