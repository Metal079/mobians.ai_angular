import sys 
from pathlib import Path 
p=Path(sys.argv[1]) 
s=int(sys.argv[2]);e=int(sys.argv[3]) 
lines=p.read_text(encoding='utf-8').splitlines() 
print('\n'.join(f'{i+1:4}: {lines[i]}' for i in range(s-1,min(e,len(lines)))))
