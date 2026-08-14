// ChainMorph Configuration
const GENLAYER_CONFIG = {
    chainId: '0xF22F',        // 61999
    chainIdDec: 61999,
    chainName: 'GenLayer Studio',
    rpcUrls: ['https://studio.genlayer.com/api'],
    nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }
};

// IMPORTANT: Replace with actual deployed contract address on GenLayer Studio
const CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890'; // Placeholder

let walletState = {
    address: null,
    isConnected: false
};

// ========================
// TOAST NOTIFICATIONS
// ========================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ========================
// WALLET MANAGEMENT
// ========================
async function connectWallet() {
    if (!window.ethereum) {
        showToast('Please install MetaMask to use ChainMorph.', 'error');
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        await switchToGenLayer();
        
        walletState.address = accounts[0];
        walletState.isConnected = true;
        localStorage.setItem('chainmorph_wallet_connected', 'true');
        
        updateWalletUI();
        showToast(`Connected: ${shortenAddress(walletState.address)}`, 'success');
        
        // Listeners
        window.ethereum.on('accountsChanged', (accs) => {
            if (accs.length === 0) disconnectWallet();
            else {
                walletState.address = accs[0];
                updateWalletUI();
            }
        });
        window.ethereum.on('chainChanged', () => window.location.reload());
    } catch (err) {
        if (err.code === 4001) showToast('Connection rejected.', 'warning');
        else showToast(`Error: ${err.message}`, 'error');
    }
}

function disconnectWallet() {
    walletState = { address: null, isConnected: false };
    localStorage.removeItem('chainmorph_wallet_connected');
    updateWalletUI();
    showToast('Wallet disconnected', 'info');
}

async function switchToGenLayer() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: GENLAYER_CONFIG.chainId }]
        });
    } catch (err) {
        if (err.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [GENLAYER_CONFIG]
            });
        }
    }
}

async function updateWalletUI() {
    const connectBtn = document.getElementById('connect-wallet-btn');
    const walletInfo = document.getElementById('wallet-info');
    const addressBadge = document.getElementById('wallet-address');
    const balanceBadge = document.getElementById('wallet-balance');

    if (walletState.isConnected && walletState.address) {
        if(connectBtn) connectBtn.classList.add('hidden');
        if(walletInfo) walletInfo.classList.remove('hidden');
        if(addressBadge) addressBadge.innerText = shortenAddress(walletState.address);
        
        // Fetch Balance
        try {
            const balHex = await window.ethereum.request({
                method: 'eth_getBalance',
                params: [walletState.address, 'latest']
            });
            const balWei = BigInt(balHex);
            const balEth = (Number(balWei) / 1e18).toFixed(4);
            if(balanceBadge) balanceBadge.innerText = `${balEth} GEN`;
        } catch (e) {
            console.error("Balance fetch error", e);
        }
    } else {
        if(connectBtn) connectBtn.classList.remove('hidden');
        if(walletInfo) walletInfo.classList.add('hidden');
    }
}

function shortenAddress(addr) {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

async function restoreSession() {
    if (window.ethereum && localStorage.getItem('chainmorph_wallet_connected') === 'true') {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            walletState.address = accounts[0];
            walletState.isConnected = true;
            updateWalletUI();
        }
    }
}

// ========================
// RPC CALLS (GENLAYER)
// ========================
async function callContractView(method, params = []) {
    try {
        const res = await fetch(GENLAYER_CONFIG.rpcUrls[0], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'gen_call',
                params: [{
                    to: CONTRACT_ADDRESS,
                    data: JSON.stringify({ method, params })
                }, 'latest'],
                id: Date.now()
            })
        });
        const json = await res.json();
        return json.result; // Returns the JSON string from Python contract
    } catch(e) {
        console.error("RPC View error", e);
        return null;
    }
}

// ========================
// STUDY PAGE LOGIC
// ========================
async function initStudyPage() {
    const proposeForm = document.getElementById('propose-form');
    if (proposeForm) {
        proposeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!walletState.isConnected) {
                showToast('Connect wallet first to propose facts.', 'error');
                return;
            }
            
            const term = document.getElementById('prop-term').value;
            const sys = document.getElementById('prop-system').value;
            const fact = document.getElementById('prop-fact').value;
            const url = document.getElementById('prop-url').value;
            
            showToast('Sending transaction... please sign in MetaMask.', 'info');
            try {
                const data = JSON.stringify({
                    method: 'propose_fact',
                    params: [term, sys, fact, url]
                });
                
                // Note: Real deployment would use ethers.js or web3.js for standard tx format.
                // Assuming standard EVM compat. value is 1 GEN (1e18 wei).
                const txHash = await window.ethereum.request({
                    method: 'eth_sendTransaction',
                    params: [{
                        from: walletState.address,
                        to: CONTRACT_ADDRESS,
                        value: '0x0de0b6b3a7640000', // 1 GEN in Hex
                        data: '0x' + btoa(data).split('').map(c => c.charCodeAt(0).toString(16)).join('') // Dummy encode for GenLayer
                    }]
                });
                showToast(`Transaction sent! Validating via Optimistic Democracy...`, 'success');
                proposeForm.reset();
                // Polling for status or refreshing would happen here
            } catch (err) {
                showToast(`Tx Failed: ${err.message}`, 'error');
            }
        });
    }

    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    const resultDisplay = document.getElementById('result-display');
    
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', async () => {
            const term = searchInput.value.trim();
            if (!term) return;
            
            searchBtn.innerText = "Loading...";
            const resData = await callContractView('get_cached_fact', [term]);
            searchBtn.innerText = "Lookup";
            
            resultDisplay.classList.remove('hidden');
            if (resData) {
                try {
                    const parsed = JSON.parse(resData);
                    if (parsed.found === false) {
                        resultDisplay.innerHTML = `<p style="opacity: 0.7">Term "${term}" not found in the dictionary. Be the first to propose it and earn GEN!</p>`;
                    } else {
                        const info = parsed.explanation;
                        resultDisplay.innerHTML = `
                            <span class="system-tag">${info.system}</span>
                            <h3 style="margin: 0.5rem 0; font-size: 1.8rem">${info.term}</h3>
                            <p style="font-size: 1.1rem; line-height: 1.6; margin-bottom: 1rem">${info.verified_fact}</p>
                            <p style="font-size: 0.9rem; opacity: 0.8; padding: 1rem; border-top: 1px solid rgba(255,255,255,0.1)">
                                <strong>AI Validator Consensus:</strong> ${info.reasoning}
                            </p>
                        `;
                    }
                } catch(e) {
                    resultDisplay.innerHTML = `<p>Error parsing dictionary data.</p>`;
                }
            } else {
                resultDisplay.innerHTML = `<p>Error connecting to GenLayer Studio.</p>`;
            }
        });
    }

    // Load Stats
    const statQ = document.getElementById('stat-queries');
    const statT = document.getElementById('stat-treasury');
    if (statQ && statT) {
        const stats = await callContractView('get_stats');
        if (stats) {
            try {
                const s = JSON.parse(stats);
                statQ.innerText = s.total_queries;
                statT.innerText = (s.treasury_wei / 1e18).toFixed(2) + " GEN";
            } catch(e){}
        }
    }
}

// ========================
// BACKGROUND PARTICLES
// ========================
function initParticles() {
    const container = document.getElementById('particle-container');
    if (!container) return;
    
    const count = 30;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 5 + 2;
        const x = Math.random() * 100;
        const delay = Math.random() * 20;
        const duration = Math.random() * 15 + 15;
        
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.left = `${x}vw`;
        p.style.animationDelay = `-${delay}s`;
        p.style.animationDuration = `${duration}s`;
        
        container.appendChild(p);
    }
}

// ========================
// INITIALIZATION
// ========================
document.addEventListener('DOMContentLoaded', async () => {
    initParticles();
    
    document.getElementById('connect-wallet-btn')?.addEventListener('click', connectWallet);
    document.getElementById('disconnect-wallet-btn')?.addEventListener('click', disconnectWallet);
    
    await restoreSession();
    
    // Page specific logic
    if (window.location.pathname.includes('study.html')) {
        initStudyPage();
    }
});
