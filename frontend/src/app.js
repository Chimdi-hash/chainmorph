import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

// ChainMorph Configuration
const GENLAYER_CONFIG = {
    chainId: '0xF22F',        // 61999
    chainIdDec: 61999,
    chainName: 'GenLayer Studio',
    rpcUrls: ['https://studio.genlayer.com/api'],
    nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }
};

// IMPORTANT: Replace with actual deployed contract address on GenLayer Studio
const CONTRACT_ADDRESS = '0xA90eFa19d6e7d47f8057CA3a6891b72EEB71f448';

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
                // Use genlayer-js SDK for correct addTransaction ABI encoding
                const writeClient = createClient({
                    chain: studionet,
                    account: walletState.address,
                    provider: window.ethereum,
                });

                const txHash = await writeClient.writeContract({
                    address: CONTRACT_ADDRESS,
                    functionName: 'propose_fact',
                    args: [term, sys, fact, url],
                    value: 1000000000000000000n, // 1 GEN (BigInt)
                });

                showToast(`Transaction sent! Waiting for validator consensus... (This may take a few seconds)`, 'info');
                
                const receipt = await writeClient.waitForTransactionReceipt({ hash: txHash });
                
                if (receipt && receipt.status !== 'reverted' && receipt.status !== 0 && receipt.status !== 'REJECTED') {
                    showToast(`Validation complete! Loading results...`, 'success');
                    proposeForm.reset();
                    
                    // Fetch lightweight history to get the outcome and reasoning
                    const historyStr = await callContractView('get_user_history', [walletState.address]);
                    let info = null;
                    if (historyStr && historyStr !== "[]") {
                        try {
                            const history = JSON.parse(historyStr);
                            if (history.length > 0) {
                                info = history[history.length - 1]; // Get the last one
                            }
                        } catch(e) { console.error(e); }
                    }

                    if (info) {
                        const resultDisplay = document.getElementById('result-display');
                        resultDisplay.classList.remove('hidden');
                        
                        document.getElementById('res-system').innerText = sys;
                        document.getElementById('res-term').innerText = info.term;
                        
                        let vizType = null;
                        let detailedExp = null;

                        if (info.accepted) {
                            document.getElementById('res-fact').innerText = info.fact;
                            document.getElementById('res-system').style.background = "var(--primary)";
                            document.getElementById('res-source').innerHTML = `Source verification complete.`;
                            
                            // Fetch cached fact to get detailed explanation and viz type
                            const cachedStr = await callContractView('get_cached_fact', [info.term_lower || term.toLowerCase()]);
                            if (cachedStr) {
                                try {
                                    const cached = JSON.parse(cachedStr);
                                    if (cached.explanation) {
                                        vizType = cached.explanation.visualization_type;
                                        detailedExp = cached.explanation.detailed_explanation;
                                    }
                                } catch(e){}
                            }
                        } else {
                            document.getElementById('res-fact').innerHTML = `<span style="color: #ff4d4d">REJECTED:</span> ${info.fact || fact}`;
                            document.getElementById('res-system').style.background = "#ff4d4d";
                            document.getElementById('res-source').innerHTML = `Validation failed.`;
                        }
                        
                        document.getElementById('res-detail').innerText = detailedExp || "";
                        document.getElementById('res-reasoning').innerText = info.reasoning || "Invalid fact.";
                        
                        const img = document.getElementById('viz-image');
                        const label = document.getElementById('viz-label');
                        if (img && info.accepted && vizType) {
                            img.src = `https://image.pollinations.ai/prompt/Scientific%20${vizType}%20of%20${encodeURIComponent(info.term)}%20human%20physiology%20detailed%20diagram%20educational?width=800&height=400&nologo=true`;
                            img.classList.remove('hidden');
                            if(label) label.innerText = vizType.replace(/_/g, ' ').toUpperCase();
                        } else if (img) {
                            img.src = "";
                            img.classList.add('hidden');
                            if(label) label.innerText = "";
                        }
                    }
                } else {
                    showToast(`Transaction reverted during execution.`, 'error');
                }
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
                        document.getElementById('res-term').innerText = `Term "${term}" not found`;
                        document.getElementById('res-system').innerText = "Unknown";
                        document.getElementById('res-fact').innerHTML = "Not found in the dictionary. Be the first to propose it and earn GEN!";
                        document.getElementById('res-detail').innerHTML = "";
                        document.getElementById('res-reasoning').innerText = "";
                        document.getElementById('res-source').innerText = "";
                        const img = document.getElementById('viz-image');
                        if (img) {
                            img.src = "";
                            img.classList.add('hidden');
                        }
                        document.getElementById('viz-label').innerText = "";
                    } else {
                        const info = parsed.explanation;
                        document.getElementById('res-system').innerText = info.system;
                        document.getElementById('res-term').innerText = info.term;
                        document.getElementById('res-fact').innerText = info.verified_fact;
                        document.getElementById('res-detail').innerText = info.detailed_explanation || "Detailed explanation not available.";
                        document.getElementById('res-reasoning').innerText = info.reasoning;
                        document.getElementById('res-source').innerHTML = `Source verification complete.`;
                        
                        drawVisualization(info.visualization_type || 'cellular_diagram', info.term);
                    }
                } catch(e) {
                    console.error(e);
                    document.getElementById('res-fact').innerHTML = `<p>Error parsing dictionary data.</p>`;
                }
            } else {
                document.getElementById('res-fact').innerHTML = `<p>Error connecting to GenLayer Studio.</p>`;
            }
        });
    }

    // Load Stats
    const statQ = document.getElementById('stat-queries');
    const statT = document.getElementById('stat-treasury');
    if (statQ && statT) {
        const stats = await callContractView('get_stats');
        
        let treasuryWei = 0;
        try {
            const res = await fetch(GENLAYER_CONFIG.rpcUrls[0], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [CONTRACT_ADDRESS, 'latest'],
                    id: Date.now()
                })
            });
            const json = await res.json();
            if (json.result) {
                treasuryWei = parseInt(json.result, 16);
            }
        } catch(e) {
            console.error("Failed to fetch treasury balance:", e);
        }

        if (stats) {
            try {
                const s = JSON.parse(stats);
                statQ.innerText = s.total_queries;
                // Prefer the true EVM balance over contract's internal representation
                const finalTreasury = treasuryWei > 0 ? treasuryWei : s.treasury_wei;
                statT.innerText = (finalTreasury / 1e18).toFixed(2) + " GEN";
            } catch(e){}
        } else if (treasuryWei > 0) {
            // Fallback if get_stats fails completely
            statT.innerText = (treasuryWei / 1e18).toFixed(2) + " GEN";
        }
    }
}

// ========================
// ACTIVITY PAGE LOGIC
// ========================
async function initActivityPage() {
    const actList = document.getElementById('activity-list');
    if (actList) {
        const activityData = await callContractView('get_recent_activity');
        if (activityData) {
            try {
                const history = JSON.parse(activityData);
                if (history.length === 0) {
                    actList.innerHTML = `<p style="opacity:0.6; font-size:0.9rem; text-align: center;">No validations yet. Be the first!</p>`;
                } else {
                    actList.innerHTML = history.map(item => {
                        const amt = (item.amount / 1e18).toFixed(1);
                        const statusColor = item.accepted ? '#00ff88' : '#ff4444';
                        const statusIcon = item.accepted ? '✅ REWARDED' : '🔥 BURNED';
                        return `
                        <div class="glass-card" style="padding: 1rem; border-left: 4px solid ${statusColor}; margin-bottom: 0.8rem; text-align: left;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.3rem;">
                                <strong style="font-size:1.1rem;">${item.term}</strong>
                                <span style="font-size:0.8rem; font-weight:bold; color:${statusColor}; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px;">${statusIcon} ${amt} GEN</span>
                            </div>
                            <div style="font-size:0.8rem; opacity:0.7; font-family:monospace;">
                                Proposer: ${shortenAddress(item.proposer)}
                            </div>
                        </div>`;
                    }).join('');
                }
            } catch(e){
                actList.innerHTML = `<p style="color:#ff4444; text-align: center;">Error loading activity.</p>`;
            }
        } else {
            actList.innerHTML = `<p style="opacity:0.6; text-align: center;">Could not connect to GenLayer RPC.</p>`;
        }
    }
}

// ========================
// REAL DIAGRAM FETCHING
// ========================
async function drawVisualization(vizType, term) {
    const imgEl = document.getElementById('viz-image');
    const labelEl = document.getElementById('viz-label');
    const sourceEl = document.getElementById('res-source');
    
    if (!imgEl) return;
    
    imgEl.classList.add('hidden');
    imgEl.src = "";
    labelEl.textContent = "Fetching authentic diagram...";
    sourceEl.innerHTML = "<em>Retrieving diagram source...</em>";

    // Fetch authentic image from Wikipedia API to avoid generated/mock images
    try {
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
        if (response.ok) {
            const wikiData = await response.json();
            if (wikiData.thumbnail && wikiData.thumbnail.source) {
                imgEl.src = wikiData.thumbnail.source;
                imgEl.onload = () => {
                    imgEl.classList.remove('hidden');
                    labelEl.textContent = `${vizType.toUpperCase().replace(/_/g,' ')} · ${term.toUpperCase()}`;
                    sourceEl.innerHTML = `<strong>Diagram Source:</strong> <a href="${wikiData.content_urls.desktop.page}" target="_blank" style="color:#00ff88; text-decoration: underline;">Wikipedia (${wikiData.title})</a>`;
                };
                return;
            }
        }
    } catch(e) {
        console.warn("Could not fetch authentic image", e);
    }

    // If no authentic image is found, we do NOT display a mock canvas diagram.
    labelEl.textContent = `NO AUTHENTIC DIAGRAM AVAILABLE FOR: ${term.toUpperCase()}`;
    sourceEl.innerHTML = `<strong>Diagram Source:</strong> None found in verified databases for this specific term.`;
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
    
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
    }
    
    await restoreSession();
    
    const path = window.location.pathname;
    if (path.includes('study.html')) {
        initStudyPage();
    } else if (path.includes('activity.html')) {
        initActivityPage();
    }
    
    // If we are on the homepage, initialize the activity feed there as well
    if (path.includes('index.html') || path === '/' || path.endsWith('/')) {
        initActivityPage();
    }
});
