# `kubectl` Quick Reference

## Basics (Viewing State)

**List all pods in the app namespace**
```bash
kubectl get pods -n urbannest
```

**List all pods with extra details (IPs, Node)**
```bash
kubectl get pods -o wide -n urbannest
```

**View all services (LoadBalancers, ClusterIPs)**
```bash
kubectl get svc -n urbannest
```

**View all deployments and their replica counts**
```bash
kubectl get deployments -n urbannest
```

**See why a pod is crashing or stuck pending**
*(Scroll to the "Events" section at the bottom of the output)*
```bash
kubectl describe pod <pod-name> -n urbannest
```
*Example:* `kubectl describe pod booking-worker-84d479bb-pg299 -n urbannest`

**Get the raw YAML definition of a running pod/deployment**
```bash
kubectl get <resource-type> <name> -n urbannest -o yaml
```
*Example:* `kubectl get pod postgres-0 -n urbannest -o yaml`

---

## Intermediate (Debugging & Logs)

**Fetch logs for a specific pod**
```bash
kubectl logs <pod-name> -n urbannest
```

**Stream logs live (like `tail -f`)**
```bash
kubectl logs -f <pod-name> -n urbannest
```

**Fetch logs for ALL pods running a specific app**
*(Useful when you have multiple replicas and don't know which one threw the error)*
```bash
kubectl logs -l app=<app-name> -n urbannest --tail 50
```
*Example:* `kubectl logs -l app=notification-service -n urbannest --tail 50`

**Open an interactive shell (bash) inside a container**
```bash
kubectl exec -it <pod-name> -n urbannest -- /bin/sh
```

**Execute a single command inside a container (without entering the shell)**
```bash
kubectl exec -it <pod-name> -n urbannest -- <command>
```
*Example (Postgres SQL shell):* `kubectl exec -it postgres-0 -n urbannest -- psql -U urbannest -d urbannest`

---

## Advanced (Modifying & Routing)

**Restart all pods in a deployment**
*(Safely spins up new pods before killing old ones)*
```bash
kubectl rollout restart deployment/<deployment-name> -n urbannest
```
*Example:* `kubectl rollout restart deployment/auth-api -n urbannest`

**Force delete a stuck pod**
*(Kubernetes will automatically recreate it)*
```bash
kubectl delete pod <pod-name> -n urbannest
```

**Port-forward a Service to your local machine**
*(Bridges a cluster port to your localhost so you can connect via browser/GUI)*
```bash
kubectl port-forward svc/<service-name> -n urbannest <local-port>:<cluster-port>
```
*Example (Postgres):* `kubectl port-forward svc/postgres -n urbannest 5432:5432`

**Scale a deployment up or down manually**
```bash
kubectl scale deployment/<deployment-name> -n urbannest --replicas=<number>
```
*Example:* `kubectl scale deployment/booking-worker -n urbannest --replicas=4`

**Apply a YAML configuration file to the cluster**
```bash
kubectl apply -f <path-to-file.yaml>
```
*Example:* `kubectl apply -f k8s/base/secret.yaml`

**Live-edit a deployment in your terminal editor**
*(Bypasses Git/files, immediately applies changes to the live cluster)*
```bash
kubectl edit deployment/<deployment-name> -n urbannest
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
kubectl top pods -n urbannest
```

**List all Secrets and ConfigMaps**
```bash
kubectl get secrets -n urbannest
kubectl get configmaps -n urbannest
```

**Decode and view a Secret's actual values**
*(Requires `jq` and `base64` utilities)*
```bash
kubectl get secret <secret-name> -n urbannest -o jsonpath="{.data.<key>}" | base64 --decode
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
*Example:* `kubectl config use-context kind-urbannest`
