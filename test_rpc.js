const fetch = require('node-fetch');

const RPC_URL = 'https://studio.genlayer.com/api';
const CONTRACT = '0xFb178bcf271Cb6Ca00F8300507D5d02048fF78d6';

async function run() {
    const addresses = [
        '0xA90eFa19d6e7d47f8057CA3a6891b72EEB71f448', // prev user address
        '0x0286b3562aEe018b13901b08b87ce3818eBA956a'  // maybe another user
    ];

    for (const addr of addresses) {
        const res = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'gen_call',
                params: [{
                    to: CONTRACT,
                    data: JSON.stringify({ method: 'get_user_history', params: [addr] })
                }, 'latest'],
                id: Date.now()
            })
        });
        const json = await res.json();
        console.log(`History for ${addr}:`, json.result);
    }
}
run();
