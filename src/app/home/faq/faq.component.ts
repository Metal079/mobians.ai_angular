import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { SharedService } from 'src/app/shared.service';

@Component({
  selector: 'app-faq',
  templateUrl: './faq.component.html',
  styleUrls: ['./faq.component.css']
})
export class FaqComponent implements OnInit, OnDestroy {
  prompt!: string;
  characterNames: string[] = [
    'Amy Rose', 'Barry the quokka', 'Big the cat', 'Blaze the cat', 'Bunnie Rabbot', 'Charmy the bee',
    'Cosmo the seedrian', 'Cream the rabbit', 'Espio the chameleon', 'Fiona Fox', 'Honey the cat', 
    'Hershey the cat', 'Infinite the jackal', 'Jet the hawk', 'Jewel the beetle', 'Knuckles the echidna',
    'Lanolin the sheep', 'Lupe the wolf', 'Marine the Raccoon', 'Metal Sonic', 'Metamorphia', 
    'Mighty the armadillo', 'Mina Mongoose', 'Mobian', 'Neo Metal Sonic', 'Nicole the Lynx', 
    'Rouge the bat', 'Ray the flying squirrel', 'Rosy the rascal', 'Sage', 'Sally Acorn', 
    'Scourge the hedgehog', 'Shadow the hedgehog', 'Silver the hedgehog', 'Shade the echidna', 
    'Sonic the hedgehog', 'Starline the platypus', 'Sticks the badger', 'Storm the albatross', 
    'Surge the tenrec', 'Tails the fox', 'Tekno the canary', 'Tangle the lemur', 'Tikal the echidna', 
    'Vanilla the rabbit', 'Vector the crocodile', 'Wave the swallow', 'Whisper the wolf', 'Zoey the fox', 
    'Zeta the echidna'
  ];
  
  private subscription: Subscription = new Subscription();

  constructor(private sharedService: SharedService) { }

  ngOnInit() {
    this.subscription = this.sharedService.getPrompt().subscribe(value => {
      this.prompt = value;
    });
  }

  changePrompt(newPrompt: string) {
    let currentPrompt = this.sharedService.getPromptValue();
    
    if (currentPrompt === '') {
      this.sharedService.setPrompt(newPrompt);
    } else {
      this.characterNames.forEach(character => {
        // If the current prompt contains a character's name, replace it with the new character's name
        let regex = new RegExp(character, "gi");
        if (regex.test(currentPrompt)) {
          currentPrompt = currentPrompt.replace(regex, newPrompt);
        }
      });
      this.sharedService.setPrompt(currentPrompt);
    }
  }
  
  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
