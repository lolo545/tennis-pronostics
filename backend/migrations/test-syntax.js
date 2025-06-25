// test-syntax.js
console.log('Test de syntaxe...');

async function test() {
    console.log('✅ Syntaxe async/await OK');
    return 'success';
}

test().then(result => {
    console.log('✅ Résultat:', result);
}).catch(error => {
    console.error('❌ Erreur:', error);
});