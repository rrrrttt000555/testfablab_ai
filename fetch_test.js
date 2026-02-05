const https = require('https');

const url = 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://академияпрофессийбудущего.рф/');

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(json.contents);
        } catch (e) {
            console.error("Parse error:", e);
        }
    });
}).on('error', (err) => {
    console.error("Error:", err.message);
});
