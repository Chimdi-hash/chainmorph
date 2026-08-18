# ChainMorph 🧬

ChainMorph is a decentralized, AI-powered physiological fact-checking and educational platform built on the **GenLayer Protocol**. It leverages Intelligent Contracts (GenVM), Large Language Models (LLMs), and Optimistic Democracy to crowdsource, verify, and reward accurate biological knowledge.

Users can stake **1 GEN** token to propose a physiological fact along with an evidence URL (e.g., Wikipedia). GenLayer's decentralized AI validator nodes read the source, cross-reference it with standard medical consensus, and vote on its accuracy. 
- **Accepted Facts** reward the proposer with **2 GEN**, and permanently cache the detailed explanation and authentic Wikipedia diagram to the frontend.
- **Rejected Facts** (hallucinations, pseudo-science, or inaccurate data) result in the **1 GEN stake being burned**.

## ✨ Key Features

- **🧠 Intelligent Contracts (GenVM):** Smart contracts written in Python that can make subjective decisions using LLMs natively.
- **🗳️ Optimistic Democracy:** Decentralized consensus where multiple AI nodes evaluate the fact and come to a majority agreement based on the Equivalence Principle.
- **🌐 Non-Deterministic Web Access:** Contracts dynamically browse the web (via \gl.nondet.web.render\) to scrape evidence URLs and fetch authentic Wikipedia diagrams—all during execution!
- **💰 Stake-to-Earn Mechanics:** Financial incentives for contributing accurate scientific data.
- **⚡ Real-time Frontend:** Built with Vite, vanilla JavaScript, and \genlayer-js\, featuring custom RPC polling to handle GenLayer's eventual consistency gracefully.

---

## 🛠️ Tech Stack

- **Smart Contracts:** Python (GenVM), GenLayer SDK
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Build Tool:** Vite
- **Blockchain Interaction:** \genlayer-js\, Viem
- **External APIs:** Wikipedia REST API (fetched on-chain by GenVM)

---

## 🏗️ Architecture

1. **The Contract (\chainmorph_contract.py\)**: 
   - Receives the proposed term, system, fact, and evidence URL.
   - Executes an LLM prompt (\prompt_non_comparative\) instructing the AI to act as a strict medical fact-checker.
   - If accurate, fetches the Wikipedia thumbnail and stores the detailed explanation.
   - Handles the staking, rewarding, and burning logic natively using \_Recipient\.

2. **The Frontend (\pp.js\)**:
   - Uses \genlayer-js\ to handle MetaMask connections (GenLayer Studio testnet).
   - Polls \eth_getTransactionReceipt\ to ensure the GenLayer transaction is finalized.
   - Queries \get_user_history\ and \get_cached_fact\ view functions, featuring robust retry loops to account for state sync and eventual consistency across the decentralized GenLayer RPC.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [MetaMask](https://metamask.io/) wallet configured for **GenLayer Studio**.

### Installation

1. **Clone the repository:**
   \\ash
   git clone https://github.com/Chimdi-hash/chainmorph.git
   cd chainmorph
   \
2. **Install frontend dependencies:**
   \\ash
   cd frontend
   npm install
   \
3. **Run the local development server:**
   \\ash
   npm run dev
   \   *The frontend will be available at \http://localhost:5173\.*

---

## 🔗 GenLayer Studio Configuration

To interact with ChainMorph, ensure your MetaMask is connected to the GenLayer testnet:
- **Network Name:** GenLayer Studio
- **RPC URL:** \https://studio.genlayer.com/api- **Chain ID:** ę11- **Currency Symbol:** \GEN
*(Note: You will need testnet GEN tokens from the GenLayer Studio faucet to propose facts).*

---

## 📝 Usage Guide

1. Navigate to the **Study** page.
2. Enter a physiological term (e.g., *Sinoatrial node*), select its body system, and propose your fact.
3. Provide a valid Wikipedia URL as evidence.
4. Click **Propose Fact (Stake 1 GEN)** and confirm the transaction in MetaMask.
5. Wait as the GenLayer validators process the data. 
6. If the AI consensus validates your fact, the detailed explanation and authentic diagram will load into the UI, and your wallet will be credited with 2 GEN!

---

## 🛡️ License

This project is licensed under the MIT License.
