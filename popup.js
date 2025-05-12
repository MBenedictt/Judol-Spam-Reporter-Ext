document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('status');
    const loginBtn = document.getElementById('login');
    const scanBtn = document.getElementById('scan');
    const confirmReportBtn = document.getElementById('confirmReport');
    const blockedInput = document.getElementById('blockedWords');
    const spamListDiv = document.getElementById('spamList');
    const scanStatus = document.getElementById('scanStatus');

    let spamComments = [];
    let selectedCommentIds = new Set();
    confirmReportBtn.style.display = 'none';

    chrome.storage.local.get(['blockedWords'], (data) => {
        blockedInput.value = data.blockedWords?.join(', ') || '';
    });

    blockedInput.addEventListener('input', () => {
        const words = blockedInput.value.split(',').map(w => w.trim()).filter(Boolean);
        chrome.storage.local.set({ blockedWords: words });
    });

    scanBtn.onclick = () => {
        scanStatus.textContent = 'Scanning comments...';
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: scrapeComments
            });
        });
    };

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'notify' && msg.message) {
            alert(msg.message);
        }

        if (msg.action === 'reloadTab') {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.reload(tabs[0].id);
            });

            spamListDiv.innerHTML = '';
            spamListDiv.style.display = 'none';
            confirmReportBtn.style.display = 'none';
            scanStatus.textContent = 'Spam comments scanned: 0';
        }

        if (msg.action === 'showSpam') {
            spamComments = msg.comments;
            spamListDiv.innerHTML = '';
            spamListDiv.style.display = 'block';
            confirmReportBtn.style.display = 'block';
            selectedCommentIds = new Set();

            scanStatus.textContent = `Spam comments scanned: ${spamComments.length}`;

            msg.comments.forEach((comment, i) => {
                const div = document.createElement('div');
                div.innerHTML = `
            <input type="checkbox" id="spam-${i}" checked />
            <label for="spam-${i}">${comment.text}</label>
            `;
                spamListDiv.appendChild(div);
                selectedCommentIds.add(comment.id);
                div.querySelector('input').addEventListener('change', (e) => {
                    if (e.target.checked) {
                        selectedCommentIds.add(comment.id);
                    } else {
                        selectedCommentIds.delete(comment.id);
                    }
                });
            });
        }
    });

    confirmReportBtn.onclick = () => {
        const toReport = spamComments.filter(c => selectedCommentIds.has(c.id));
        if (toReport.length === 0) {
            alert("No comments selected for reporting.");
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: reportCommentsById,
                args: [toReport.map(c => c.id)]
            });
        });
    };
});

function scrapeComments() {
    setTimeout(() => {
        const threads = Array.from(document.querySelectorAll("ytd-comment-thread-renderer"));

        const data = threads.map(thread => {
            const textEl = thread.querySelector("#content-text");
            const anchor = thread.querySelector("a[href*='lc=']");

            const text = textEl?.innerText?.trim() || '';
            let id = null;

            if (anchor) {
                const url = new URL(anchor.href);
                id = url.searchParams.get("lc");
            }

            return { id, text };
        }).filter(comment => comment.id && comment.text);

        chrome.runtime.sendMessage({ action: 'foundComments', comments: data });
    }, 1000);
}

function reportCommentsById(commentIds) {
    async function reportCommentById(commentId) {
        const thread = Array.from(document.querySelectorAll("ytd-comment-thread-renderer"))
            .find(t => {
                const anchor = t.querySelector("a[href*='lc=']");
                const id = anchor ? new URL(anchor.href).searchParams.get("lc") : null;
                return id === commentId;
            });

        if (!thread) return;

        const menuButton = thread.querySelector('#action-menu button');
        if (!menuButton) return;
        menuButton.click();

        await new Promise(r => setTimeout(r, 500));

        const reportItem = Array.from(document.querySelectorAll('tp-yt-paper-item'))
            .find(item => item.innerText.toLowerCase().includes("report"));
        if (!reportItem) return;
        reportItem.click();

        await new Promise(r => setTimeout(r, 800));

        // Step 1: Select the spam reason (by label)
        const spamOption = Array.from(document.querySelectorAll('label.radio-shape-wiz__label-container'))
            .find(label => label.innerText.toLowerCase().includes("spam") || label.innerText.toLowerCase().includes("misleading"));
        if (spamOption) {
            spamOption.click();
        } else {
            console.warn("Spam reason not found");
            return;
        }

        await new Promise(r => setTimeout(r, 400));

        // Step 2: Click the report confirm button
        const confirmBtn = Array.from(document.querySelectorAll('button'))
            .find(btn => btn.innerText.trim().toLowerCase() === "report");

        if (confirmBtn) {
            confirmBtn.click();
            console.log("Comment reported");
        } else {
            console.warn("Report confirm button not found");
        }
    }

    (async () => {
        for (const id of commentIds) {
            await reportCommentById(id);
            await new Promise(r => setTimeout(r, 800));
        }

        chrome.runtime.sendMessage({ action: 'notify', message: 'Spam comments reported' });
        chrome.runtime.sendMessage({ action: 'reloadTab' });
    })();
}
