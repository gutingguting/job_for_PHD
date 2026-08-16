(() => {
  if (globalThis.jobForPhdAdapters) return;
  const commonControls = 'input,select,textarea,[contenteditable="true"],[role="textbox"],[role="combobox"]';
  globalThis.jobForPhdAdapters = {
    moka: {
      hosts: [/mokahr/i],
      controls: `${commonControls},.ant-select-selector input,.el-select input`,
      options: '[role="option"],.ant-select-item-option,.el-select-dropdown__item',
      group: '[role="group"],.form-item,.ant-form-item,.el-form-item',
      label: 'label,.ant-form-item-label,.el-form-item__label,legend',
    },
    workday: {
      hosts: [/myworkdayjobs/i, /workday/i],
      controls: `${commonControls},button[aria-haspopup="listbox"],[data-automation-id*="formField"] input`,
      options: '[role="option"],[data-automation-id="promptOption"]',
      group: '[role="group"],[data-automation-id*="formField"]',
      label: 'label,legend,[data-automation-id*="label"]',
    },
    greenhouse: {
      hosts: [/greenhouse/i],
      controls: `${commonControls},#application_form input,#application_form select,#application_form textarea`,
      options: '[role="option"],select option',
      group: '.field,.field-row,.application-question,[role="group"]',
      label: 'label,legend,.field-label',
    },
    generic: {
      hosts: [], controls: commonControls, options: '[role="option"]',
      group: '[role="group"],.form-item', label: 'label,legend',
    },
  };
})();
