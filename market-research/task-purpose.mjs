// Only explicitly verified automation fixtures belong here. Never infer from task names.
// This controls presentation only; ownership and access remain enforced by RLS.
export const AUTOMATION_TASK_IDS = Object.freeze([
  'a0cc3068-b7ae-4899-bd07-ef7059dc4d16',
]);
export const isAutomationTask = task => AUTOMATION_TASK_IDS.includes(task.id);
export const AUTOMATION_NOTICE = '验收测试任务：保留 / 排除中包含流程测试状态，不代表业务筛选结论。';
