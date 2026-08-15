import os
import pytest
import json

# Workaround for genlayer-test Windows PermissionError on os.unlink temp file
original_unlink = os.unlink
def safe_unlink(path, *args, **kwargs):
    try:
        original_unlink(path, *args, **kwargs)
    except PermissionError:
        pass
os.unlink = safe_unlink

@pytest.mark.direct
def test_chainmorph_direct_payout(direct_deploy, direct_vm, direct_alice, direct_bob):
    # Deploy the chainmorph contract
    contract = direct_deploy("contracts/chainmorph_contract.py")
    
    # 1. Fund the contract natively to ensure fully collateralized rewards
    # We do this from Bob's account. He deposits 5 GEN.
    with direct_vm.prank(direct_bob):
        direct_vm.value = 5 * 10**18
        contract.fund_treasury()
    
    # 2. Mock web and LLM to force acceptance
    evidence_url = "https://medical-dictionary.com/heart"
    direct_vm.mock_web(evidence_url, {"body": "The heart is a muscular organ that pumps blood.", "method": "GET", "status": 200})
    
    acceptance_json = json.dumps({
        "is_accurate": True,
        "reasoning": "The definition matches the source exactly.",
        "term": "heart",
        "system": "Cardiovascular",
        "verified_fact": "The heart is a muscular organ that pumps blood.",
        "detailed_explanation": "The heart acts as the central pump of the cardiovascular system.",
        "visualization_type": "anatomical_cross_section"
    })
    
    # Mock prompt_non_comparative directly
    import genlayer.gl as gl
    original_prompt = getattr(gl.eq_principle, 'prompt_non_comparative', None)
    gl.eq_principle.prompt_non_comparative = lambda prompt, task, criteria: acceptance_json
    
    try:
        # 3. Alice proposes term with 1 GEN stake
        with direct_vm.prank(direct_alice):
            direct_vm.value = 1 * 10**18
            contract.propose_fact("heart", "Cardiovascular", "The heart is a muscular organ that pumps blood.", evidence_url)
        
        # 4. Verify native balance increased by exactly the promised amount (2 GEN)
        # Using trace check since direct_vm doesn't natively apply EthSend to _balances in this test loader version
        found_transfer = False
        target_amount = 2 * 10**18
        
        for trace in direct_vm._traces:
            trace_str = str(trace)
            if "EthSend" in trace_str and str(target_amount) in trace_str:
                found_transfer = True
                break
                
        assert found_transfer, "Claimant's native balance did not increase by full promised amount (2 GEN EthSend trace missing)."
        
    finally:
        if original_prompt:
            gl.eq_principle.prompt_non_comparative = original_prompt
