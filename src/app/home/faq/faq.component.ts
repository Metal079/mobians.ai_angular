import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SharedService } from 'src/app/shared.service';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { environment } from 'src/environments/environment';

@Component({
    selector: 'app-faq',
    templateUrl: './faq.component.html',
    styleUrls: ['./faq.component.css'],
    standalone: true,
    imports: [CommonModule]
})
export class FaqComponent implements OnInit, OnDestroy {
  private clientId = '1186062405168549949';
  private redirectUri = encodeURIComponent(environment.discordRedirectUri);
  prompt!: string;
  serverMember: boolean = false;
  discordUserID: string = '';
  characterNames: string[] = [
    'Amy Rose', 'Barry the quokka', 'Big the cat', 'Blaze the cat', 'Bunnie Rabbot', 'Charmy the bee',
    'Cosmo the seedrian', 'Cream the rabbit', 'Eggman', 'Espio the chameleon', 'Fiona Fox', 'Honey the cat', 
    'Hershey the cat', 'Infinite the jackal', 'Jet the hawk', 'Jewel the beetle', "Julie-Su the echidna", 'Knuckles the echidna',
    'Lanolin the sheep', 'Lien-Da the echidna', 'Lupe the wolf', 'Marine the Raccoon', 'Metal Sonic', 'Metamorphia', 
    'Mighty the armadillo', 'Mina Mongoose', 'Mobian', 'Neo Metal Sonic', 'Nicole the Lynx', 
    'Rouge the bat', 'Ray the flying squirrel', 'Rosy the rascal', 'Sage', 'Sally Acorn', 'Sonia the hedgehog',
    'Scourge the hedgehog', 'Shadow the hedgehog', 'Silver the hedgehog', 'Shade the echidna', 
    'Sonic the hedgehog', 'Starline the platypus', 'Sticks the badger', 'Storm the albatross', 'Synth the robot',
    'Surge the tenrec', 'Tails the fox', 'Tekno the canary', 'Tangle the lemur', 'Tikal the echidna', 
    'Vanilla the rabbit', 'Vector the crocodile', 'Wave the swallow', 'Whisper the wolf', 'Zoey the fox', 
    'Zeta the echidna'
  ];
  
  private subscription: Subscription = new Subscription();

  constructor(private sharedService: SharedService
    , private route: ActivatedRoute
    , private http: HttpClient
    , private stableDiffusionService: StableDiffusionService) { }

  ngOnInit() {
    this.subscription = this.sharedService.getPrompt().subscribe(value => {
      this.prompt = value;
    });


    this.route.queryParams.subscribe(params => {
      console.log('Query Params:', params); // Add this to check if queryParams are received
      const code = params['code'];
      if (code) {
        this.exchangeCode(code);
      }
    });

    // Discord userdata check
    this.sharedService.getUserData().subscribe(userData => {
      if (userData) {
        this.serverMember = userData.is_member_of_your_guild;
        this.discordUserID = userData.discord_user_id;
      }
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

  authenticateWithDiscord() {
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${this.clientId}&redirect_uri=${this.redirectUri}&response_type=code&scope=identify%20guilds`;
  }

  private exchangeCode(code: string) {
    this.stableDiffusionService.discordLogin({ code: code })
        .subscribe(response => {
            console.log(response);
            this.sharedService.setUserData(response); // Assuming response contains user data
        }, error => {
            console.error(error);
        });
}

}
