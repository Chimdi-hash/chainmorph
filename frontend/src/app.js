import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

// ChainMorph Configuration
const GENLAYER_CONFIG = {
    chainId: '0xf22f',        // 61999
    chainIdDec: 61999,
    chainName: 'GenLayer Studio',
    rpcUrls: ['https://studio.genlayer.com/api'],
    nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }
};

// IMPORTANT: Replace with actual deployed contract address on GenLayer Studio
const CONTRACT_ADDRESS = '0xd58787A79284ADd29D9aaA9bf53f820A444676eB';

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
    } catch (err) {
        if (err.code === 4001) showToast('Connection rejected.', 'warning');
        else showToast(`Error: ${err.message}`, 'error');
    }
}

function disconnectWallet() {
    walletState = { address: null, isConnected: false };
    localStorage.removeItem('chainmorph_wallet_connected');
    localStorage.removeItem('chainmorph_last_result');
    const resultDisplay = document.getElementById('result-display');
    if (resultDisplay) resultDisplay.classList.add('hidden');
    updateWalletUI();
    showToast('Wallet disconnected', 'info');
}

async function switchToGenLayer() {
    try {
        const addChainParams = {
            chainId: GENLAYER_CONFIG.chainId,
            chainName: GENLAYER_CONFIG.chainName,
            rpcUrls: GENLAYER_CONFIG.rpcUrls,
            nativeCurrency: GENLAYER_CONFIG.nativeCurrency
        };
        await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [addChainParams]
        });
    } catch (err) {
        console.error("Failed to switch/add GenLayer network:", err);
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
        
        // Fetch Balance directly from RPC to bypass MetaMask desyncs
        try {
            const res = await fetch(GENLAYER_CONFIG.rpcUrls[0], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getBalance',
                    params: [walletState.address, 'latest'],
                    id: Date.now()
                })
            });
            const data = await res.json();
            if (data && data.result) {
                const balWei = BigInt(data.result);
                const balEth = (Number(balWei) / 1e18).toFixed(4);
                if(balanceBadge) balanceBadge.innerText = `${balEth} GEN`;
            }
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

async function initWallet() {
    if (window.ethereum) {
        // Setup listeners globally once on page load
        window.ethereum.on('accountsChanged', (accs) => {
            if (accs.length === 0) {
                disconnectWallet();
            } else {
                walletState.address = accs[0];
                walletState.isConnected = true;
                localStorage.setItem('chainmorph_wallet_connected', 'true');
                updateWalletUI();
            }
        });
        window.ethereum.on('chainChanged', () => window.location.reload());

        // Auto-connect ONLY if they previously connected (prevents page-load popups)
        if (localStorage.getItem('chainmorph_wallet_connected') === 'true') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts && accounts.length > 0) {
                    walletState.address = accounts[0];
                    walletState.isConnected = true;
                    updateWalletUI();
                }
            } catch (e) {
                console.error("Failed to query authorized accounts:", e);
            }
        }
    }
}

async function callContractView(method, args = []) {
    try {
        // Create a fresh client with the studio endpoint explicitly set
        const client = createClient({
            chain: {
                ...studionet,
                rpcUrls: {
                    default: { http: ['https://studio.genlayer.com/api'] }
                }
            },
            account: walletState.address || '0x0000000000000000000000000000000000000001'
        });

        // Wrap in a 30s timeout to prevent hanging
        const result = await Promise.race([
            client.readContract({
                address: CONTRACT_ADDRESS,
                functionName: method,
                args: args
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('readContract timeout')), 30000)
            )
        ]);

        return result;
    } catch(e) {
        console.error('RPC View error:', method, e.message);
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
                
                // Custom polling loop to avoid viem aggressive polling rate limits/CORS errors
                let receipt = null;
                for (let i = 0; i < 60; i++) {
                    await new Promise(r => setTimeout(r, 3000));
                    try {
                        const res = await window.ethereum.request({
                            method: 'eth_getTransactionReceipt',
                            params: [txHash]
                        });
                        if (res && res.blockNumber) {
                            receipt = res;
                            break;
                        }
                    } catch(e) {
                        console.warn("Polling receipt...", e);
                    }
                }
                
                if (!receipt) throw new Error("Transaction receipt polling timed out. The transaction might still be processing.");
                
                if (receipt && receipt.status !== '0x0' && receipt.status !== 0 && receipt.status !== 'REJECTED') {
                    showToast(`Validation complete! Loading results from GenLayer...`, 'success');
                    proposeForm.reset();
                    
                    // Poll lightweight history until the RPC state syncs the new transaction
                    let info = null;
                    for (let attempts = 0; attempts < 30; attempts++) {
                        const historyStr = await callContractView('get_user_history', [walletState.address]);
                        if (historyStr && historyStr !== "[]") {
                            try {
                                const history = JSON.parse(historyStr);
                                if (history.length > 0) {
                                    // Scan backwards to find the most recent match for this term
                                    for (let i = history.length - 1; i >= 0; i--) {
                                        const h = history[i];
                                        if ((h.term_lower && h.term_lower === term.toLowerCase()) || 
                                            (h.term && h.term.toLowerCase() === term.toLowerCase())) {
                                            info = h;
                                            break;
                                        }
                                    }
                                }
                            } catch(e) { console.error(e); }
                        }
                        if (info) break;
                        // Wait 3 seconds before checking again
                        await new Promise(r => setTimeout(r, 3000));
                    }

                    if (!info) {
                        showToast("Result taking longer than expected to sync to RPC. Please check your activity feed in a moment.", "warning");
                    }
                    if (info) {
                        if (info.accepted) {
                            let cachedStr = null;
                            // Retry loop for cache due to eventual consistency across GenLayer RPC nodes
                            for (let c = 0; c < 10; c++) {
                                cachedStr = await callContractView('get_cached_fact', [info.term_lower || term.toLowerCase()]);
                                if (cachedStr && !cachedStr.includes('"found": false') && !cachedStr.includes('"found":False')) {
                                    break;
                                }
                                await new Promise(r => setTimeout(r, 2000));
                            }
                            
                            if (cachedStr) {
                                try {
                                    const cached = JSON.parse(cachedStr);
                                    if (cached.explanation) {
                                        info.image_url = cached.explanation.image_url;
                                        info.source_url = cached.explanation.source_url;
                                        info.detailed_explanation = cached.explanation.detailed_explanation;
                                    }
                                } catch(e){}
                            }
                        }
                        renderResult(info, sys);
                    }
                } else {
                    showToast(`Transaction reverted during execution.`, 'error');
                }
            } catch (err) {
                showToast(`Tx Failed: ${err.message}`, 'error');
            }
        });
    }

    // Restore last result on load
    const saved = localStorage.getItem('chainmorph_last_result');
    if (saved) {
        try {
            const { info, sys } = JSON.parse(saved);
            renderResult(info, sys, false);
        } catch (e) {}
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

function renderResult(info, sys, save = true) {
    if (save) {
        localStorage.setItem('chainmorph_last_result', JSON.stringify({info, sys}));
    }

    const resultDisplay = document.getElementById('result-display');
    if (!resultDisplay) return;
    
    resultDisplay.classList.remove('hidden');
    
    document.getElementById('res-system').innerText = sys;
    document.getElementById('res-term').innerText = info.term;
    
    let detailedExp = info.detailed_explanation || null;

    if (info.accepted) {
        document.getElementById('res-fact').innerText = info.fact;
        document.getElementById('res-system').style.background = "var(--primary)";
        document.getElementById('res-source').innerHTML = `Source verification complete.`;
    } else {
        document.getElementById('res-fact').innerHTML = `<span style="color: #ff4d4d">REJECTED:</span> ${info.fact || ""}`;
        document.getElementById('res-system').style.background = "#ff4d4d";
        document.getElementById('res-source').innerHTML = `Validation failed.`;
    }
    
    document.getElementById('res-detail').innerText = detailedExp || "";
    document.getElementById('res-reasoning').innerText = info.reasoning || "Invalid fact.";
    
    // Handle Wikipedia Image and Source
    const img = document.getElementById('viz-image');
    const label = document.getElementById('viz-label');
    
    if (img && info.accepted && info.image_url) {
        img.src = info.image_url;
        img.classList.remove('hidden');
        if(label) label.innerText = "Wikipedia Image";
    } else if (img) {
        img.src = "";
        img.classList.add('hidden');
        if(label) label.innerText = "";
    }

    if (info.accepted && info.source_url) {
        document.getElementById('res-source').innerHTML = `Source: <a href="${info.source_url}" target="_blank" style="color: var(--primary)">${info.source_url}</a>`;
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
    
    await initWallet();
    
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
