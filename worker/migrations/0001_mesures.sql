-- Mesure des demandes de devis (base D1 « legantis-mesures », binding MESURES). Préparée le 26/10/2026, activée seulement
-- quand le user crée la base et redéploie (voir worker/README.md « Compteur de demandes »). Aucune donnée personnelle :
-- ni nom, ni e-mail, ni téléphone, ni entreprise, ni texte, ni adresse IP.

-- Compteur agrégé : une ligne par jour (UTC), issue, type de projet, langue, parcours (formulaire d'origine) et source marketing ; n s'incrémente.
-- source et campagne viennent des paramètres utm_source et utm_campaign de la page : ce sont des étiquettes de campagne, pas des données personnelles.
-- issue : envoye (Resend a accepté le mail), doublon (même demande renvoyée sous 10 min : ni mail ni comptage double),
--         echec_envoi (Resend en erreur ou injoignable), invalide (champs refusés), piege (champ anti-robot rempli),
--         limite (limite de débit), exception (erreur inattendue du Worker).
CREATE TABLE IF NOT EXISTS devis_compteur (
  jour   TEXT    NOT NULL,
  issue  TEXT    NOT NULL,
  type   TEXT    NOT NULL DEFAULT '',
  langue TEXT    NOT NULL DEFAULT '',
  parcours TEXT  NOT NULL DEFAULT '',
  source   TEXT  NOT NULL DEFAULT '',
  campagne TEXT  NOT NULL DEFAULT '',
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (jour, issue, type, langue, parcours, source, campagne)
);

-- Empreintes éphémères anti-doublon : SHA-256 de (sel, e-mail, texte du projet), jamais le contenu lui-même,
-- gardées 10 minutes puis purgées à chaque requête. Elles servent seulement à reconnaître un renvoi de la même demande
-- (double clic, retour arrière, réseau coupé avant la réponse).
CREATE TABLE IF NOT EXISTS devis_empreintes (
  empreinte TEXT    PRIMARY KEY,
  expire    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS devis_empreintes_expire ON devis_empreintes (expire);
