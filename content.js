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

// Listen for script injection or future actions (optional)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'scrapeComments') {
        scrapeComments();
    }
});