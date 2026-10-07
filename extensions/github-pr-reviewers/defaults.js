// Valeurs par defaut, partagees par le service worker (importScripts) et la page d'options.
// Elles ne s'appliquent que tant que rien n'a ete enregistre dans chrome.storage.local :
// une fois les options sauvegardees, ce sont les valeurs stockees qui priment.
const DEFAULT_SETTINGS = {
    token: '',
    team: ['e-k-n-i-t', 'apzgw', 'tomsoulage-dedalus', 'mohammedsel', 'lucas-merienne'],
    unavailable: ['apzpr'],
    showTeam: true,
    showRandom: true,
    addReviewer: true,
    addAssignee: true,
    hideSelf: true,
    replaceExisting: false
};
