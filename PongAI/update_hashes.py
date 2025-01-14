import os
import pickle
import hashlib
from pathlib import Path


def convert_numpy_arrays(data):
    """Convertit les arrays numpy en listes Python"""
    if isinstance(data, dict):
        return {k: v.tolist() if hasattr(v, 'tolist') else v for k, v in data.items()}
    return data


def calculate_hash(data, secret):
    """Calcule le hash SHA-256 avec la clé secrète"""
    # Convertir les arrays numpy en listes
    data = convert_numpy_arrays(data)

    # print(f"Type des données: {type(data)}")
    if isinstance(data, dict):
        # print(f"Taille du dictionnaire: {len(data)}")
        first_item = next(iter(data.items())) if data else None
        # print(f"Premier élément du dictionnaire: {first_item}")

    secret_bytes = secret.encode('utf-8')

    # Trier le dictionnaire si nécessaire
    if isinstance(data, dict):
        from collections import OrderedDict
        data = OrderedDict(sorted(data.items()))

    data_bytes = pickle.dumps(data, protocol=2)
    # print(f"Taille des données sérialisées: {len(data_bytes)}")
    # print(f"Premiers bytes sérialisés (hex): {data_bytes[:50].hex()}")

    combined_bytes = secret_bytes + data_bytes
    # print(f"Taille totale des bytes combinés: {len(combined_bytes)}")

    hash_value = hashlib.sha256(combined_bytes).hexdigest()
    # print(f"Hash final: {hash_value}")

    return hash_value

def update_hashes(data_dir="./PongAI/ai_data", env_file=".env"):
    # Lire la clé secrète depuis .env
    secret = None
    with open(env_file, 'r') as f:
        for line in f:
            if line.startswith('AI_HASH_SECRET='):
                secret = line.strip().split('=')[1]
                # print(f"secret key = {secret}")
                break

    if not secret:
        # print("Erreur: AI_HASH_SECRET non trouvée dans .env")
        exit(1)

    data_dir = Path(data_dir)

    # Mettre à jour les permissions du répertoire
    try:
        os.chmod(data_dir, 0o775)  # rwxrwxr-x
    except Exception as e:
        print(f"Warning: Impossible de modifier les permissions du répertoire: {e}")

    # Traiter tous les fichiers .pkl
    for pkl_file in data_dir.glob("*.pkl"):
        if pkl_file.exists() and pkl_file.stat().st_size > 0:
            try:
                # print(f"Traitement de {pkl_file}")
                # Charger la Q-table
                with open(pkl_file, 'rb') as f:
                    qtable = pickle.load(f)

                hash_file = pkl_file.with_suffix('.hash')

                # Si le fichier hash existe, le rendre modifiable
                if hash_file.exists():
                    os.chmod(hash_file, 0o664)  # rw-rw-r--

                # Calculer et sauvegarder le nouveau hash
                hash_value = calculate_hash(qtable, secret)

                # print(f"hash_value = {hash_value} for pkl_file = {pkl_file} and secret = {secret}")

                with open(hash_file, 'w') as f:
                    f.write(hash_value)

                # Mettre à jour les permissions finales du hash
                os.chmod(hash_file, 0o664)  # rw-rw-r--
                # print(f"Hash mis à jour pour {pkl_file}")

            except Exception as e:
                print(f"Erreur lors du traitement de {pkl_file}: {e}")


if __name__ == "__main__":
    update_hashes()