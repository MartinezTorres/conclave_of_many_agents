#!/usr/bin/env python3
import sys, json, hashlib, subprocess, re

def die(msg):
    sys.stdout.write(json.dumps({"allowed": False, "reason": msg}) + "\n")
    sys.exit(1)

def ok():
    sys.stdout.write(json.dumps({"allowed": True}) + "\n")
    sys.exit(0)

def run(cmd):
    return subprocess.check_output(cmd, shell=True, text=True).strip()

def sha256(s: str) -> str:
    import hashlib
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

raw = sys.stdin.read().strip()
if not raw:
    die("COMA gate: no tool-call payload on stdin")
try:
    payload = json.loads(raw)
except Exception as e:
    die(f"COMA gate: invalid JSON on stdin: {e}")

tool = (payload.get("tool_name") or payload.get("name") or "").lower()
inp = payload.get("input") or payload.get("tool_input") or ""

if tool != "bash":
    ok()

m = re.search(r"^\\s*###\\s*COMA_BUNDLE_START\\s*$([\\s\\S]*?)^\\s*###\\s*COMA_BUNDLE_END\\s*$",
              inp, flags=re.MULTILINE)
if not m:
    die("COMA gate: missing COMA bundle (### COMA_BUNDLE_START/END)")

bundle_json = m.group(1).strip()
try:
    bundle = json.loads(bundle_json)
except Exception as e:
    die(f"COMA gate: invalid COMA bundle JSON: {e}")

proposal_id = bundle.get("proposal_id")
head = bundle.get("head")
files = bundle.get("files") or []
verdicts = bundle.get("verdicts") or []
unanimous = bundle.get("unanimous") is True
declared_digest = bundle.get("digest")
diff_sha256 = bundle.get("diff_sha256")

if not (proposal_id and head and isinstance(files, list) and isinstance(verdicts, list) and diff_sha256 and declared_digest):
    die("COMA gate: incomplete bundle fields")

repo_head = run("git rev-parse HEAD")
if repo_head != head:
    die(f"COMA gate: HEAD mismatch (bundle {head} vs repo {repo_head})")

repo_files = run("git ls-files -z | tr '\\0' '\\n' | sort").splitlines()
if repo_files != files:
    die("COMA gate: repository file set changed since approvals were collected")

if not unanimous:
    die("COMA gate: bundle not marked unanimous")
if len(verdicts) != len(files):
    die("COMA gate: verdicts count does not match file count")
for v in verdicts:
    if v.get("decision") != "approve":
        die(f"COMA gate: rejection present for {v.get('file_path')}")
    if not v.get("file_path"):
        die("COMA gate: missing file_path in a verdict")

cmd_body = inp[:m.start()] + inp[m.end():]
cmd_body_norm = cmd_body.strip()
if sha256(cmd_body_norm) != diff_sha256:
    die("COMA gate: diff/commands digest mismatch")

can = {
    "proposal_id": proposal_id,
    "head": head,
    "files": files,
    "verdicts": verdicts,
    "diff_sha256": diff_sha256
}
can_json = json.dumps(can, separators=(",", ":"), sort_keys=True)
if sha256(can_json) != declared_digest:
    die("COMA gate: bundle digest mismatch")

ok()
