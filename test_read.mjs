import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = '0xEEf7bE86F5a06cc8F8F63B608C84D54C94340420';
const addr = '0xA90eFa19d6e7d47f8057CA3a6891b72EEB71f448';

async function run() {
    try {
        const readClient = createClient({
            chain: studionet,
            account: addr
        });

        console.log("Calling get_user_history...");
        const result = await readClient.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_user_history',
            args: [addr]
        });
        
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
