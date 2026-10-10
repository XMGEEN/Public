export async function autoAIState(client,task,purpose){
 const r=await client.from('market_auto_ai_operations').select('status,error_code').eq('task_id',task.id).eq('input_revision',task.revision).eq('purpose',purpose).order('created_at',{ascending:false}).limit(1);
 if(r.error)return null;
 return r.data?.[0]||null;
}
export function autoAIMessage(op){
 if(['queued','running'].includes(op?.status))return 'AI正在自动整理，请稍候…';
 if(op?.status!=='paused')return '';
 const reasons={AUTO_AI_BATCH_BUDGET:'完整样本所需批次超过每任务4次上限',AUTO_AI_BUDGET:'已达到自动AI费用上限',AUTO_AI_TASK_BUDGET:'任务总预算不足',AUTO_AI_UNSETTLED:'上次调用费用或结果尚未核实',AUTO_AI_PREVIOUS_OUTCOME_PAUSED:'上次调用未通过，已保留回执',AUTO_AI_SCOPE_OR_STALE:'仅支持美国站，或资料已更新',AUTO_AI_STALE:'资料已有人工修改',AI_INPUT_TOO_LARGE:'完整输入超过模型限额'};
 return 'AI已暂停：'+(reasons[op.error_code]||'执行未通过，请联系维护人员核对')+'。可继续人工调整。';
}
