let spamList = [];

chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.action === 'foundComments') {
        chrome.storage.local.get(['blockedWords'], async ({ blockedWords }) => {
            spamList = msg.comments.filter(({ text }) => {
                const normalized = text.normalize('NFKD');
                const isWeird = normalized !== text;
                const matched = blockedWords?.some(word => text.toLowerCase().includes(word.toLowerCase()));
                return isWeird || matched;
            });

            chrome.runtime.sendMessage({ action: 'showSpam', comments: spamList });
        });
    }


});