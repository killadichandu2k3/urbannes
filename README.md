# UrbanNes — Full-Stack Event Booking Platform

UrbanNes is an enterprise-grade, event-ticketing microservices platform built with **Angular 17**, **Apollo Federation GraphQL**, **Apache Kafka**, **PostgreSQL**, and **Redis**, deployable on **Docker Compose** or a multi-node **Kubernetes (Kind)** cluster managed via **ArgoCD GitOps**.

---

## System Architecture

```
[ Browser / Angular SPA ]
            │ (HTTP / WebSocket :8080 or :30000)
            ▼
   [ API Gateway / NGINX ]
            │
            ├─► [ Gateway GraphQL (Apollo Federation) ]
            │         ├─► [ Auth API (:4600) ] ──────► PostgreSQL + Redis
            │         ├─► [ Booking API (:4000) ] ────► Kafka (Request/Reply) ──► [ Booking Worker ] ──► PostgreSQL
            │         └─► [ Analytics API (:4300) ] ─► PostgreSQL + Redis
            │
            ├─► [ Booking API /ws ] (WebSocket push bridge for live seat updates)
            └─► [ Static Assets / Angular Dist ]
```

### Key Components

| Service | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | Angular 17, Tailwind CSS, RxJS, Apollo | Modern glassmorphism SPA with live seat map, QR tickets, and booking manager. |
| **API Gateway** | NGINX 1.27 | Single public ingress, SSL/TLS termination, rate limiting, and reverse proxy. |
| **Gateway GraphQL** | Apollo Gateway (Federation v2) | Composes Auth, Booking, and Analytics subgraphs into a unified API schema. |
| **Auth API** | Node.js, Express, TypeORM | User registration, bcrypt authentication, JWT issuance, and email OTP verification. |
| **Booking API** | Node.js, Express, Kafka Producer | Handles client booking commands, translates GraphQL mutations to Kafka events. |
| **Booking Worker** | Node.js, Kafka Consumer, Redis Locks | Transactional booking engine, atomic seat locking, dynamic pricing, and Razorpay verification. |
| **Analytics API** | Node.js, Express, Apollo Subgraph | Real-time seat inventory calculation, revenue breakdown, and platform stats. |
| **Notification Service** | Node.js, Kafka Consumer, Resend | Asynchronously delivers email confirmations and notification inbox records. |
| **Storage & Cache** | PostgreSQL 16, Redis 7, Kafka 7.6 | Primary ACID database, distributed caching, pub/sub, and event streaming. |

---

## Application Pages & Flow

- **Public Landing Page (`/`)**: Editorial hero experience, upcoming highlights, verified payment marks, and quick link to the dashboard.
- **Events Dashboard (`/events`)**: Categorized by entertainment types (Concerts & Sports, Theatre & Arts, Movies) with live occupancy indicators (`% Full`, `seats remaining`), status badges (`Booking Open` vs `Sold Out`), and auto-sorting by booking velocity.
- **Real-Time Seat Map (`/events/:id/seats`)**: Live multi-tier seating grid (Standard, Gold, Platinum, VIP) with 5-minute Redis hold locks, instant price computation, and integrated Razorpay test checkout.
- **My Bookings (`/my-bookings`)**: Dual-section dashboard separating **Active Bookings** (Confirmed, Held, Payment Pending) at the top from **Canceled & Expired Bookings**, complete with digital QR tickets.
- **Notifications & Profile (`/profile`)**: Live notifications bell with unread badges, mark-all-as-read, and account details.

---

## Running the Platform

You can run UrbanNes using **Docker Compose** (fastest local setup) or **Kind Kubernetes + ArgoCD** (full production-grade cluster).

### Path A — Docker Compose (Recommended for quick local testing)

#### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (allocate at least 7–8 GB memory in Settings → Resources).
- Node.js 20+ (optional, only needed if running dev server locally).

#### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Optional: Add your Razorpay test keys and Resend API key. If left blank, the app operates in local log-fallback mode where OTP codes and email content are printed to container logs).*

#### 3. Start the Stack
```bash
docker compose up --build
```
Once containers are healthy, access the app at:
👉 **`http://localhost:8080`**

#### 4. Shut Down
```bash
docker compose down        # preserves database volumes
docker compose down -v     # resets database volumes to fresh seed
```

---

### Path B — Kind (Kubernetes) + ArgoCD GitOps

#### 1. Prerequisites
Install `kind` and `kubectl`:
```bash
# Windows (PowerShell Administrator)
choco install kind kubernetes-cli

# macOS
brew install kind kubectl
```

#### 2. Deploy Cluster & Services
Run the bootstrap script:
```bash
./scripts/deploy-kind.sh
```
This script creates a 3-node Kind cluster (`1 control-plane, 2 workers`), builds and loads all container images, installs ArgoCD, and lets ArgoCD synchronize the `k8s/` manifests.

#### 3. Access Services
- **Web Application**: 👉 **`http://localhost:30000`**
- **ArgoCD Dashboard**: 👉 **`https://localhost:8090`**
  ```bash
  kubectl port-forward svc/argocd-server -n argocd 8090:443
  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
  ```

#### 4. Tear Down
```bash
./scripts/teardown-kind.sh          # tears down application pods
kind delete cluster --name urbannes # deletes the Kind cluster entirely
```

---

## Development FAQ & Directory Insights

### What are the `.angular/cache` and `webpack` folders in `frontend`?
When compiling Angular applications with Angular CLI (`ng build` or `ng serve`), Angular creates a `.angular/cache` directory (e.g. `.angular/cache/17.3.17/`):
- **`angular-webpack/`**: Stores Webpack's persistent compilation cache, including module resolution graphs, parsed ASTs, and sourcemap cache. This allows subsequent builds to run in seconds rather than recompiling everything from scratch.
- **`babel-webpack/`**: Stores Babel's transformation cache for modern ES/TypeScript downleveling and polyfill optimizations.
- **Safe to delete?**: **Yes, 100% safe.** It is a temporary cache that is automatically recreated on the next build. It is excluded by `.gitignore` (`.angular/`). You can clear it anytime with:
  ```bash
  cd frontend && npx ng cache clean
  ```

### How to rebuild after making changes?
- **Backend changes**:
  ```bash
  docker build -t urbannes/<service>:latest -f services/<service>/Dockerfile .
  kind load docker-image urbannes/<service>:latest --name urbannes
  kubectl rollout restart deployment/<service> -n urbannes
  ```
- **Frontend changes**:
  ```bash
  docker build -t urbannes/gateway:latest -f gateway/Dockerfile .
  kind load docker-image urbannes/gateway:latest --name urbannes
  kubectl rollout restart deployment/gateway -n urbannes
  ```

---

## License
MIT
