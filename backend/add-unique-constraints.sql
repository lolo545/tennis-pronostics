-- Ajouter les contraintes UNIQUE manquantes pour la synchronisation

-- Contrainte UNIQUE sur atp_id (quand non NULL)
ALTER TABLE tournaments 
ADD CONSTRAINT unique_atp_id UNIQUE (atp_id) DEFERRABLE INITIALLY DEFERRED;

-- Contrainte UNIQUE sur wta_id (quand non NULL)  
ALTER TABLE tournaments 
ADD CONSTRAINT unique_wta_id UNIQUE (wta_id) DEFERRABLE INITIALLY DEFERRED;

-- Afficher les contraintes créées
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'tournaments' 
    AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.constraint_name;