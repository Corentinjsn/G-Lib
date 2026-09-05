# Fixtures

Vrais fichiers produits par les launchers, gardés tels quels pour que les
parsers soient testés contre le format réel — y compris ses bizarreries, comme
le `™` en UTF-8 de `ea_installerdata.xml` qui trahit toute lecture en codepage
hérité.

Les identifiants liés à un compte ou à une machine ont été remplacés par des
valeurs neutres : `LastOwner` (un SteamID64), `contentid`, `InstallSessionId`.
Aucun test ne les lit. La liste d'applications de `libraryfolders.vdf` a aussi
été réduite à quelques entrées.
