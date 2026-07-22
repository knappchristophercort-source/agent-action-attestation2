# GitHub Codespaces Setup Guide
# For Library Laptops (No Admin Rights Needed)

---

## BEFORE YOU GO TO THE LIBRARY (Do This on Your Phone)

### Step 1: Create GitHub Account
1. Open browser on your phone
2. Go to github.com
3. Click "Sign up" → follow prompts
4. Verify email

### Step 2: Create the Repository
1. Go to github.com/new (or click "+" → "New repository")
2. Repository name: `agent-action-attestation`
3. Description: `Cryptographic audit trails for AI agent actions — SEC 17a-4, SOC 2, PCI-DSS compliant`
4. Select "Public"
5. Check "Add a README file"
6. Click "Create repository"

### Step 3: Upload the Code (on Your Phone)
1. In your new repo, click "Add file" → "Upload files"
2. Click "choose your files"
3. Select the `agent-attestation-v2.zip` file
4. Wait for upload to complete
5. Scroll down, click "Commit changes"

---

## AT THE LIBRARY (Do This on the Laptop)

### Step 4: Open GitHub Codespaces
1. Open browser on library laptop
2. Go to github.com and sign in
3. Navigate to your `agent-action-attestation` repo
4. Click the green "<> Code" button
5. Click "Codespaces" tab
6. Click "Create codespace on main"
7. Wait 30-60 seconds for it to load

You now have a full Linux terminal in your browser.

### Step 5: Unzip and Test
In the Codespace terminal (bottom panel), type:

```bash
# Unzip the uploaded file
unzip agent-attestation-v2.zip -d agent-attestation
cd agent-attestation

# Check Node.js version (should be v18+)
node -v

# Run the demo
node demo/compliance-demo.js
```

You should see:
```
=== Agent Action Attestation — WAL Ledger Demo ===
... 
Result: VALID ✓
```

### Step 6: Record the Video with asciinema
In the same terminal:

```bash
# Install asciinema (no admin needed)
pip3 install asciinema

# Record the demo
asciinema rec demo.cast --command "bash -c 'cd agent-attestation && node demo/compliance-demo.js && echo "---" && node scripts/verify-ledger.js'"

# The recording starts. Let it run through the demo.
# When done, type: exit
```

### Step 7: Upload the Recording
```bash
# Upload to asciinema.org (gives you a shareable URL)
asciinema upload demo.cast
```

Copy the URL it gives you. It looks like:
`https://asciinema.org/a/123456`

### Step 8: Clean Up the Repo
The zip file shouldn't stay in the repo. Remove it:

```bash
# In the Codespace terminal
cd ..
rm agent-attestation-v2.zip
```

Then in the browser (GitHub website):
1. Go to your repo
2. Click on `agent-attestation-v2.zip`
3. Click the trash icon ("Delete file")
4. Commit the deletion

### Step 9: Organize the Files Properly
In the Codespace terminal:

```bash
# Move files from the nested folder to root
cd agent-attestation
mv agent-attestation/* .
mv agent-attestation/.* . 2>/dev/null || true
rmdir agent-attestation 2>/dev/null || true

# Check what we have
ls -la
```

You should see:
```
.gitignore
README.md
SECURITY.md
docs/
package.json
demo/
scripts/
src/
```

### Step 10: Commit Everything
```bash
git add .
git commit -m "Initial commit: WAL ledger, compliance exports, verification"
git push origin main
```

If `git` commands fail, use the GitHub web interface:
1. In Codespace, click the Source Control icon (left sidebar, looks like a branch)
2. Type message: "Initial commit"
3. Click the checkmark to commit
4. Click "..." → "Push"

---

## POSTING TO HACKER NEWS (Back on Your Phone)

### Step 11: Copy the asciinema URL
Find the URL from Step 7 in your notes or email it to yourself.

### Step 12: Write the HN Post
1. Go to news.ycombinator.com on your phone
2. Click "submit"
3. Title: `Show HN: Tamper-proof audit logs for AI agents (SEC/SOC2/PCI compliant)`
4. URL: Your GitHub repo URL (`github.com/YOURNAME/agent-action-attestation`)
5. Text: Paste the HN post draft (from earlier conversation)
6. Add the asciinema video URL at the bottom
7. Click "Submit"

### Step 13: Monitor and Respond
- Refresh the post every 5-10 minutes
- Respond to comments within 15 minutes
- Be honest, not defensive
- If someone finds a bug, thank them and fix it in Codespace

---

## TROUBLESHOOTING

### "node: command not found"
```bash
# Check if Node is installed
which node || echo "Node not found"

# If not installed, install via nvm (no admin needed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
node -v
```

### "pip3: command not found"
```bash
# Try pip instead
pip install asciinema

# Or use apt if available
sudo apt install asciinema

# If all else fails, use the phone-recording-laptop method
```

### "asciinema upload fails"
```bash
# Save the .cast file locally
cp demo.cast /tmp/

# Download it from Codespace (right-click → Download)
# Then upload manually at asciinema.org
```

### Codespace won't load
```bash
# Try GitPod instead
gitpod.io/#https://github.com/YOURNAME/agent-action-attestation
```

---

## TIME ESTIMATES

| Task | Time |
|------|------|
| Phone setup (GitHub account + repo) | 10 minutes |
| Upload zip file | 5 minutes |
| Library: Open Codespace | 2 minutes |
| Library: Unzip + test demo | 3 minutes |
| Library: Record video | 5 minutes |
| Library: Upload + get URL | 2 minutes |
| Library: Clean up repo | 5 minutes |
| Library: Commit + push | 3 minutes |
| Phone: Post to HN | 5 minutes |
| **Total library time** | **~20 minutes** |
| **Total phone time** | **~20 minutes** |

---

## WHAT TO BRING TO THE LIBRARY

- [ ] Phone (with GitHub account already created)
- [ ] The zip file on your phone or uploaded to cloud
- [ ] This guide (screenshot or print)
- [ ] Patience (library WiFi can be slow)

---

## EMERGENCY: If Everything Fails

Record the video with your phone:
1. Open the Codespace terminal
2. Run the demo
3. Hold phone in landscape mode
4. Record the laptop screen
5. Upload to YouTube as unlisted
6. Use that URL in your HN post

It's not pretty, but it works. HN cares about content, not production value.
