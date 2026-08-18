# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json

@gl.evm.contract_interface
class _Recipient:
    class View: pass
    class Write: pass

class ChainMorphDictionary(gl.Contract):
    """
    CHAINMORPH: Decentralized Oracle & Dictionary for Human Physiology.

    ECONOMIC MODEL:
    - Stake 1 GEN per proposition (fact or definition).
    - ACCEPTED  -> Caller immediately receives 2 GEN (native transfer).
    - REJECTED  -> 1 GEN is immediately burned (sent to null address).
    """

    # Storage
    query_history: TreeMap[str, str]       # Address -> JSON history
    all_facts_cache: TreeMap[str, str]     # Term -> JSON fact data
    total_queries: u256
    popular_systems_list: str              # JSON list of physiological systems
    recent_activity: str                   # JSON list of recent global activity

    def __init__(self):
        self.total_queries = u256(0)
        self.popular_systems_list = json.dumps(["Cardiovascular", "Nervous", "Respiratory", "Muscular", "Skeletal", "Digestive", "Endocrine", "Immune"])
        self.recent_activity = json.dumps([])

    def _addr(self, address) -> str:
        if hasattr(address, "as_hex"):
            return address.as_hex.lower()
        return str(address).lower()

    @gl.public.write
    def receive(self):
        # Native fallback to accept GEN funding directly
        pass

    @gl.public.write.payable
    def propose_fact(self, term: str, physiological_system: str, proposed_fact: str, evidence_url: str):
        caller = gl.message.sender_address
        stake = gl.message.value
        ONE_GEN = 1000000000000000000  # 1e18 wei

        if stake < ONE_GEN:
            raise Exception("Must stake at least 1 GEN to propose a fact.")

        term_clean = term.strip()
        term_lower = term_clean.lower()

        if not term_lower:
            raise Exception("Term cannot be empty.")

        if term_lower in self.all_facts_cache:
            raise Exception(f"'{term_clean}' is already in the ChainMorph dictionary.")

        # Check if contract has enough uncommitted funds to back the 2x reward natively
        try:
            current_balance = gl.get_self_balance()
        except AttributeError:
            current_balance = 9999999999999999999999
            
        reward_wei = int(stake) * 2
        if current_balance < reward_wei:
            raise Exception("Contract treasury is low. Cannot guarantee reward right now.")

        # AI Validation Process
        def build_prompt() -> str:
            # Render evidence URL
            web_data = gl.nondet.web.render(evidence_url, mode='text')
            
            return f"""You are a STRICT medical and physiological fact-checker for ChainMorph, a human physiology oracle.
Your job is to REJECT incorrect physiological data, hallucinations, or definitions not supported by the evidence.

Term proposed: "{term_clean}"
System: "{physiological_system}"
Proposed Fact: "{proposed_fact}"
Evidence URL: "{evidence_url}"

--- EVIDENCE WEBPAGE CONTENT ---
{web_data}
--------------------------------

STEP 1 -> Read the evidence webpage content carefully.
STEP 2 -> Find what the source says about "{term_clean}".
STEP 3 -> Compare the proposed fact against the source facts.
STEP 4 -> Apply REJECTION CRITERIA below.

MANDATORY REJECTION RULES (set is_accurate=false if ANY apply):
- The proposed fact describes the WRONG biological function.
- The fact places the term in the WRONG organ system (e.g., Nervous when it should be Cardiovascular).
- The fact contains made-up, pseudo-science, or hallucinated information NOT found in the source (unless the source is inaccessible, in which case use standard medical consensus).
- The proposed fact is scientifically inaccurate based on standard human physiology.
- The term has nothing to do with human physiology.

If the EVIDENCE WEBPAGE CONTENT is empty, shows an error, or an anti-bot challenge, YOU MUST rely on your internal expert medical knowledge to verify if the fact is scientifically accurate. Only set is_accurate=true if the proposed fact perfectly matches the physiological facts stated in the evidence URL or standard medical consensus (if evidence is blocked).

Return ONLY a valid JSON object (no markdown, no extra text):
{{
    "is_accurate": false,
    "reasoning": "Explain why it matches or fails against the evidence.",
    "term": "{term_clean}",
    "system": "{physiological_system}",
    "verified_fact": "Correct fact based on evidence (if true, otherwise empty)",
    "detailed_explanation": "A thorough, educational explanation of the term's physiological function and clinical significance (if accurate)."
}}"""

        result_str = gl.eq_principle.prompt_non_comparative(
            build_prompt,
            task="Verify the proposed human physiology fact using the evidence URL.",
            criteria=(
                "The response is a valid JSON containing 'is_accurate' and 'reasoning'. "
                "CRITICAL: 'is_accurate' MUST be false if the fact contradicts the evidence or standard physiology, "
                "or if it describes the wrong system. 'is_accurate' is only true if it perfectly matches the source. "
                "Include a detailed educational explanation if accurate."
            ),
        )

        # Parse AI output
        try:
            cleaned = result_str.strip()
            if "```" in cleaned:
                s = cleaned.find("{"); e = cleaned.rfind("}") + 1
                if s >= 0 and e > s:
                    cleaned = cleaned[s:e]
            data = json.loads(cleaned)
            if not isinstance(data, dict):
                data = {}
        except Exception:
            data = {}

        # Non-deterministic Wikipedia image fetch
        def fetch_wiki_image() -> str:
            term_encoded = term_clean.replace(" ", "%20")
            wiki_api_url = f"https://en.wikipedia.org/w/api.php?action=query&titles={term_encoded}&prop=pageimages&format=json&pithumbsize=800"
            try:
                # Use render to bypass bot protections
                wiki_res = gl.nondet.web.render(wiki_api_url, mode='text')
                wiki_data = json.loads(wiki_res)
                pages = wiki_data.get("query", {}).get("pages", {})
                for page_id, page_info in pages.items():
                    if "thumbnail" in page_info:
                        return page_info["thumbnail"]["source"]
            except Exception:
                pass
            return ""

        wiki_image_url = gl.eq_principle.prompt_non_comparative(
            fetch_wiki_image,
            task="Fetch Wikipedia image URL for the term",
            criteria="Return the Wikipedia image URL string, or empty string if not found. Do not include any other text."
        ).strip()

        is_accurate = bool(data.get("is_accurate", False))
        caller_str = self._addr(caller)
        stake_int = int(stake)

        safe_exp = {
            "term": data.get("term", term_clean),
            "system": data.get("system", physiological_system),
            "verified_fact": data.get("verified_fact", proposed_fact),
            "detailed_explanation": data.get("detailed_explanation", ""),
            "image_url": wiki_image_url,
            "source_url": evidence_url,
            "reasoning": data.get("reasoning", "")
        }

        # Prepare the validation payload to return live from this transaction
        validation_result = json.dumps({
            "term": safe_exp["term"],
            "system": safe_exp["system"],
            "fact": proposed_fact,
            "verified_fact": safe_exp["verified_fact"],
            "detailed_explanation": safe_exp["detailed_explanation"],
            "image_url": safe_exp["image_url"],
            "source_url": safe_exp["source_url"],
            "reasoning": safe_exp["reasoning"],
            "accepted": is_accurate
        })

        if is_accurate:
            # ACCEPTED: Direct Native Transfer of 2x Stake (Reward)
            _Recipient(caller).emit_transfer(value=u256(reward_wei), on='finalized')
            
            # Cache result
            self.all_facts_cache[term_lower] = json.dumps({
                "explanation": safe_exp,
                "validator_consensus": True,
                "proposer": caller_str
            })
            
            self._record(caller_str, term_lower, term_clean, safe_exp.get("verified_fact", ""), safe_exp.get("reasoning", ""), True, stake_int)
        else:
            # REJECTED: Real Burning of the Stake
            # Transfer the stake to the null address (0x00...000)
            null_address = Address("0x0000000000000000000000000000000000000000")
            _Recipient(null_address).emit_transfer(value=u256(stake_int), on='finalized')
            
            self._record(caller_str, term_lower, term_clean, proposed_fact, data.get("reasoning", "Invalid fact."), False, stake_int)

        self.total_queries += 1
        
        # Return the adjudication result live without storing it in temporary memory
        return validation_result

    def _record(self, caller_str: str, term_lower: str, term_display: str, fact: str, reasoning: str, accepted: bool, stake_int: int):
        try:
            hist = json.loads(self.query_history[caller_str]) if caller_str in self.query_history else []
            if not isinstance(hist, list): hist = []
        except Exception:
            hist = []
        
        hist.append({
            "term": term_display, 
            "term_lower": term_lower,
            "fact": fact, 
            "reasoning": reasoning,
            "accepted": accepted
        })
        if len(hist) > 50: hist = hist[-50:]
        self.query_history[caller_str] = json.dumps(hist)
        
        # Global Activity Feed
        try:
            global_hist = json.loads(self.recent_activity)
            if not isinstance(global_hist, list): global_hist = []
        except Exception:
            global_hist = []
            
        global_hist.insert(0, {
            "proposer": caller_str,
            "term": term_display,
            "accepted": accepted,
            "amount": stake_int * 2 if accepted else stake_int
        })
        if len(global_hist) > 10: global_hist = global_hist[:10]
        self.recent_activity = json.dumps(global_hist)

    @gl.public.view
    def get_cached_fact(self, term: str) -> str:
        k = term.strip().lower()
        return self.all_facts_cache[k] if k in self.all_facts_cache else json.dumps({"found": False})

    @gl.public.view
    def get_user_history(self, user_address: str) -> str:
        k = user_address.strip().lower()
        return self.query_history[k] if k in self.query_history else "[]"

    @gl.public.view
    def get_recent_activity(self) -> str:
        return self.recent_activity

    @gl.public.view
    def get_popular_systems(self) -> str:
        return self.popular_systems_list

    @gl.public.view
    def get_stats(self) -> str:
        try:
            bal = gl.get_self_balance()
        except:
            bal = 0
        return json.dumps({
            "total_queries": int(self.total_queries),
            "treasury_wei": int(bal)
        })
