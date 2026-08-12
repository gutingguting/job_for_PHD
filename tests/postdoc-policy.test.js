const test = require('node:test');
const assert = require('node:assert/strict');
const {
  postdocPolicy, validatePostdocPreferences, validatePostdocRecord,
} = require('../src/postdoc-policy');

const preferences = {
  postdoc: {
    enabled: true,
    research_areas: ['质子治疗的电子学相关岗位'],
    target_institutions: [],
  },
};

test('enabled postdoc workflow requires at least one strict research area', () => {
  const errors = validatePostdocPreferences({ postdoc: { enabled: true, research_areas: [] } });
  assert.deepEqual(errors.map(error => error.field), ['postdoc.research_areas']);
});

test('strict research allowlist accepts an exact saved selection', () => {
  const errors = validatePostdocRecord({
    institute: 'Paul Scherrer Institute',
    matched_research_area: '质子治疗的电子学相关岗位',
  }, preferences);
  assert.deepEqual(errors, []);
});

test('strict research allowlist rejects adjacent electronics and timing directions', () => {
  for (const direction of ['探测器电子学', '加速器电子学', '高精度时钟与定时']) {
    const errors = validatePostdocRecord({
      institute: 'Paul Scherrer Institute',
      matched_research_area: direction,
      research_fit: 'FPGA、DAQ、时钟背景高度匹配',
    }, preferences);
    assert.ok(errors.some(error => error.field === 'matched_research_area'), direction);
  }
});

test('configured institution allowlist is independently enforced', () => {
  const constrained = {
    postdoc: { ...preferences.postdoc, target_institutions: ['PSI'] },
  };
  assert.deepEqual(validatePostdocRecord({
    matched_research_area: '质子治疗的电子学相关岗位',
    matched_target_institution: 'PSI',
  }, constrained), []);
  const errors = validatePostdocRecord({
    matched_research_area: '质子治疗的电子学相关岗位',
    matched_target_institution: 'CERN',
  }, constrained);
  assert.ok(errors.some(error => error.field === 'matched_target_institution'));
});

test('postdoc policy is always strict and normalizes duplicate blank entries', () => {
  assert.deepEqual(postdocPolicy({ postdoc: {
    enabled: true,
    research_areas: [' 质子治疗 ', '', '质子治疗'],
    match_policy: 'soft',
  } }), {
    enabled: true,
    match_policy: 'strict',
    research_areas: ['质子治疗'],
    target_institutions: [],
  });
});
