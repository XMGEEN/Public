(function(){
'use strict';
function open(task,client,user){window.QAAnswerUI.clear();const host=document.getElementById('answers');if(!host||!task||task.unsaved||!user)return;return window.QAAnswerUI.open({host,store:window.QAAnswerStore.create(client,task)});}
window.QAAnswers={open,clear:()=>window.QAAnswerUI.clear()};
})();
