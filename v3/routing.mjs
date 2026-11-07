const includes = (values, code) => Array.isArray(values) && values.includes(code);

export function personalDriving(answers) {
  const confirmed = answers['A3-DRV-PT-01'];
  if (includes(confirmed, 97)) return false;
  return includes(answers['A-MOB-01'], 4) || answers['A-MOB-PRIMARY'] === 4 ||
    answers['A-JRN-02'] === 4 || [1, 2, 3, 4, 5].some(code => includes(confirmed, code));
}

export function optionCFlags(answers, driving, informed) {
  const powertrains = answers['A3-DRV-PT-01'] || [];
  const professionalDriving = [1, 2].includes(answers['A-PRO-DRIVE-01']);
  const showPersonalPowertrain = driving === 1 || answers['A-JRN-02'] === 4 || professionalDriving;
  const personallyDrove = showPersonalPowertrain && personalDriving(answers);
  const personalPlug = personallyDrove && [1, 2].some(code => includes(powertrains, code));
  const personalNonPlug = personallyDrove && [3, 4].some(code => includes(powertrains, code));
  const personallyCharged = informed && answers['D3-CHG-HANDS-01'] === 1;
  return {
    showPersonalPowertrain,
    personalDriving: personallyDrove,
    personalPlugDriving: personalPlug,
    personalNonPlugDriving: personalNonPlug,
    professionalDriving,
    prospectiveEV: personalNonPlug && !personalPlug,
    handsOnCharging: personallyCharged,
    chargingExperience: personallyCharged ? 'hands_on' : informed ? 'arrangement_known' : 'not_established',
    householdVehicleInfluence: answers['A-HH-DEC-VEH-02'] ?? null,
    chargeDecisionRole: answers['A-DEC-01'] ?? null,
    exportContractAuthority: answers['F-AUTH-V-01'] ?? null
  };
}

export function optionCRouteMatches(route, r) {
  switch (route) {
    case 'option_c_driving': return r.optionC.showPersonalPowertrain;
    case 'option_c_nonplug_driver': return r.optionC.prospectiveEV;
    case 'option_c_charges': return r.optionC.handsOnCharging;
    case 'option_c_current_v2g': return r.privateRoute && r.technology === 'v2g' && r.informed && r.locations.length > 0;
    default: return false;
  }
}

export function routeDiagnostics(a, r) {
  const skippedContext = (id, status) => a[id] === 1 ? 'shown' :
    a[id] === 2 ? 'context_not_evaluable' : a[id] === 98 ? 'cannot_judge' :
      a[id] === 99 ? 'declined' : status;
  const technology = (block, id, eligible) => {
    if (!r.ready) return 'eligibility_unanswered';
    if (!r.householdOrFuture) return 'no_household_or_future_role';
    if (!eligible) return 'private_service_not_evaluable';
    if (block !== r.technology && block !== r.secondaryTechnology) return 'eligible_not_assigned';
    return skippedContext(id, 'context_unanswered');
  };
  return {
    transport: r.transport ? 'shown' : a['B-TRIP-CONTEXT'] === 97 ? 'trip_context_not_evaluable' :
      a['B-MODE-EVAL'] === undefined ? 'eligibility_unanswered' : 'fewer_than_two_evaluable_modes',
    wpt: technology('wpt', 'G-WPT-CONTEXT-01', r.eligibleW),
    v2g: technology('v2g', 'G-V2G-CONTEXT-01', r.eligibleV),
    mobilityIntention: r.combTarget,
    chargingExperience: r.optionC.chargingExperience
  };
}
