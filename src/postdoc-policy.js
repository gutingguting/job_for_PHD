function cleanList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))];
}

function sameChoice(left, right) {
  return String(left ?? '').trim().toLocaleLowerCase() === String(right ?? '').trim().toLocaleLowerCase();
}

function postdocPolicy(preferences = {}) {
  const postdoc = preferences.postdoc || {};
  return {
    enabled: postdoc.enabled === true,
    match_policy: 'strict',
    research_areas: cleanList(postdoc.research_areas),
    target_institutions: cleanList(postdoc.target_institutions),
  };
}

function validatePostdocPreferences(preferences = {}) {
  const policy = postdocPolicy(preferences);
  const errors = [];
  if (policy.enabled && !policy.research_areas.length) {
    errors.push({
      field: 'postdoc.research_areas',
      message: '启用博士后工作流时，必须至少设置一个研究方向；研究方向将作为硬性白名单。',
    });
  }
  return errors;
}

function validatePostdocRecord(record = {}, preferences = {}) {
  const policy = postdocPolicy(preferences);
  const errors = [];
  if (!policy.enabled) {
    errors.push({ field: 'postdoc.enabled', message: '博士后工作流未启用，不能新增或修改博士后机会。' });
    return errors;
  }
  errors.push(...validatePostdocPreferences(preferences));
  if (!policy.research_areas.some(area => sameChoice(area, record.matched_research_area))) {
    errors.push({
      field: 'matched_research_area',
      message: `该机会必须明确匹配已保存的研究方向：${policy.research_areas.join('、') || '未配置'}`,
    });
  }
  if (policy.target_institutions.length && !policy.target_institutions.some(institute => sameChoice(institute, record.matched_target_institution))) {
    errors.push({
      field: 'matched_target_institution',
      message: `该机会必须明确匹配已保存的目标机构：${policy.target_institutions.join('、')}`,
    });
  }
  return errors;
}

module.exports = { postdocPolicy, validatePostdocPreferences, validatePostdocRecord };
