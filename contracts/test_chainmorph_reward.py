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
    
    # 1. Fund the contract natively using receive()
    with direct_vm.prank(direct_bob):
        direct_vm.value = 5 * 10**18
        contract.receive()
    
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
    
    import genlayer.gl as gl
    original_prompt = getattr(gl.eq_principle, 'prompt_non_comparative', None)
    
    try:
        # --- TEST 1: Oversized Stake ---
        # User stakes 3 GEN (oversized), but the payout should still only be 2 GEN total (1 GEN returned + 1 GEN reward)
        gl.eq_principle.prompt_non_comparative = lambda prompt, task, criteria: acceptance_json
        
        with direct_vm.prank(direct_alice):
            direct_vm.value = 3 * 10**18
            contract.propose_fact("heart", "Cardiovascular", "The heart is a muscular organ that pumps blood.", evidence_url)
        
        found_transfer = False
        target_amount = 2 * 10**18 # payout capped to 2 GEN
        
        for trace in direct_vm._traces:
            trace_str = str(trace)
            if "EthSend" in trace_str and str(target_amount) in trace_str:
                found_transfer = True
                break
                
        assert found_transfer, "Payout wasn't capped to exactly 2 GEN for oversized stake"

        # --- TEST 2: Malformed Verdict ---
        # Reset and use a new term
        direct_vm._traces = []
        malformed_json = "This is not json { garbage... is_accurate: 'maybe' ]"
        gl.eq_principle.prompt_non_comparative = lambda prompt, task, criteria: malformed_json
        
        with direct_vm.prank(direct_alice):
            direct_vm.value = 1 * 10**18
            # Malformed verdict should "fail closed" resulting in a burn of 1 GEN
            contract.propose_fact("lung", "Respiratory", "Lungs breathe.", evidence_url)
            
        found_burn = False
        burn_amount = 1 * 10**18
        
        for trace in direct_vm._traces:
            trace_str = str(trace)
            if "EthSend" in trace_str and str(burn_amount) in trace_str and "0x0000000000000000000000000000000000000000" in trace_str:
                found_burn = True
                break
                
        assert found_burn, "Malformed verdict didn't safely fail closed and burn exactly 1 GEN"

        # --- TEST 3: Strict Boolean Verdict (String "true" should fail closed) ---
        direct_vm._traces = []
        string_true_json = json.dumps({
            "is_accurate": "true", # String instead of boolean
            "reasoning": "The definition matches the source exactly.",
            "term": "kidney",
            "system": "Urinary",
            "verified_fact": "Filters blood.",
            "detailed_explanation": "Filters blood.",
            "visualization_type": "anatomical_cross_section"
        })
        gl.eq_principle.prompt_non_comparative = lambda prompt, task, criteria: string_true_json
        
        with direct_vm.prank(direct_alice):
            direct_vm.value = 1 * 10**18
            # String true should "fail closed" resulting in a burn of 1 GEN
            contract.propose_fact("kidney", "Urinary", "Filters blood.", evidence_url)
            
        found_string_burn = False
        
        for trace in direct_vm._traces:
            trace_str = str(trace)
            if "EthSend" in trace_str and str(burn_amount) in trace_str and "0x0000000000000000000000000000000000000000" in trace_str:
                found_string_burn = True
                break
                
        assert found_string_burn, "String 'true' didn't safely fail closed and burn exactly 1 GEN"
        
    finally:
        if original_prompt:
            gl.eq_principle.prompt_non_comparative = original_prompt
