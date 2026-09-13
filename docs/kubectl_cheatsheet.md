# `kubectl` Quick Reference

## Basics (Viewing State)

**List all pods in the app namespace**
```bash
kubectl get pods -n urbannes
```

**List all pods with extra details (IPs, Node)**
```bash
kubectl get pods -o wide -n urbannes
```

**View all services (LoadBalancers, ClusterIPs)**
```bash
kubectl get svc -n urbannes
```

**View all deployments and their replica counts**
```bash
kubectl get deployments -n urbannes
```

**See why a pod is crashing or stuck pending**
*(Scroll to the "Events" section at the bottom of the output)*
```bash
kubectl describe pod <pod-name> -n urbannes
```
*Example:* `kubectl describe pod booking-worker-84d479bb-pg299 -n urbannes`

**Get the raw YAML definition of a running pod/deployment**
```bash
kubectl get <resource-type> <name> -n urbannes -o yaml
```
*Example:* `kubectl get pod postgres-0 -n urbannes -o yaml`

---

## Intermediate (Debugging & Logs)

**Fetch logs for a specific pod**
```bash
kubectl logs <pod-name> -n urbannes
```

**Stream logs live (like `tail -f`)**
```bash
kubectl logs -f <pod-name> -n urbannes
```

**Fetch logs for ALL pods running a specific app**
*(Useful when you have multiple replicas and don't know which one threw the error)*
```bash
kubectl logs -l app=<app-name> -n urbannes --tail 50
```
*Example:* `kubectl logs -l app=notification-service -n urbannes --tail 50`

**Open an interactive shell (bash) inside a container**
```bash
kubectl exec -it <pod-name> -n urbannes -- /bin/sh
```

**Execute a single command inside a container (without entering the shell)**
```bash
kubectl exec -it <pod-name> -n urbannes -- <command>
```
*Example (Postgres SQL shell):* `kubectl exec -it postgres-0 -n urbannes -- psql -U urbannes -d urbannes`

---

## Advanced (Modifying & Routing)

**Restart all pods in a deployment**
*(Safely spins up new pods before killing old ones)*
```bash
kubectl rollout restart deployment/<deployment-name> -n urbannes
```
*Example:* `kubectl rollout restart deployment/auth-api -n urbannes`

**Force delete a stuck pod**
*(Kubernetes will automatically recreate it)*
```bash
kubectl delete pod <pod-name> -n urbannes
```

**Port-forward a Service to your local machine**
*(Bridges a cluster port to your localhost so you can connect via browser/GUI)*
```bash
kubectl port-forward svc/<service-name> -n urbannes <local-port>:<cluster-port>
```
*Example (Postgres):* `kubectl port-forward svc/postgres -n urbannes 5432:5432`

**Scale a deployment up or down manually**
```bash
kubectl scale deployment/<deployment-name> -n urbannes --replicas=<number>
```
*Example:* `kubectl scale deployment/booking-worker -n urbannes --replicas=4`

**Apply a YAML configuration file to the cluster**
```bash
kubectl apply -f <path-to-file.yaml>
```
*Example:* `kubectl apply -f k8s/base/secret.yaml`

**Live-edit a deployment in your terminal editor**
*(Bypasses Git/files, immediately applies changes to the live cluster)*
```bash
kubectl edit deployment/<deployment-name> -n urbannes
```

---

## Cluster & Resource Management

**Check the status of your physical/virtual cluster nodes**
```bash
kubectl get nodes
```

**Check CPU and Memory usage of your nodes**
*(Requires metrics-server to be installed)*
```bash
kubectl top nodes
```

**Check CPU and Memory usage of individual pods**
```bash
kubectl top pods -n urbannes
```

**List all Secrets and ConfigMaps**
```bash
kubectl get secrets -n urbannes
kubectl get configmaps -n urbannes
```

**Decode and view a Secret's actual values**
*(Requires `jq` and `base64` utilities)*
```bash
kubectl get secret <secret-name> -n urbannes -o jsonpath="{.data.<key>}" | base64 --decode
```

---

## Contexts (Multi-Cluster Navigation)

**List all clusters you are connected to**
```bash
kubectl config get-contexts
```

**Switch your terminal to target a different cluster**
```bash
kubectl config use-context <context-name>
```
*Example:* `kubectl config use-context kind-urbannes`

---

## ArgoCD & GitOps

**Get ArgoCD admin password**
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
```

**Port-forward ArgoCD UI to localhost:8090**
```bash
kubectl port-forward svc/argocd-server -n argocd 8090:443
```

**Restart local Git server for ArgoCD**
*(Needed if you made changes to the `k8s/` folder locally and want ArgoCD to sync them)*
```bash
kubectl delete pod git-server -n argocd
kubectl apply -f k8s-argocd/git-server.yaml
```

