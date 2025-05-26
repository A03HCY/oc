import requests
from rich import print

payload = {
    "prompt": "",
    "tags": "instrumental, bass solo, groovy, funky, melodic bass",
    "mv": "chirp-v4",
    "make_instrumental": True,
    "title": "Deep Groove Excursion"
}


headers = {
    'Accept': 'application/json',
    'Authorization': 'Bearer sk-gqBb7gEaQ6FNRpGuimJxJCjoEFoyqGqWoxGQM7z1wrF0OACz',
    'Content-Type': 'application/json'
}

response = requests.post('https://yunwu.ai/suno/submit/music', headers=headers, json=payload)

if response.status_code == 200:
    print("[green]Request was successful![/green]")
    data = response.json().get('data')
    print(data)

    response = requests.get(f'https://yunwu.ai/suno/fetch/{data}', headers=headers)

    if response.status_code == 200:
        print("[green]Request was successful![/green]") 
        print(response.json())