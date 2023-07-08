import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { HomeModule } from '../modules/home.module';  // updated import
import { FormsModule } from '@angular/forms';
import { SharedService } from 'src/app/shared.service';


import { AppComponent } from './app.component';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    HomeModule  
  ],
  providers: [SharedService],
  bootstrap: [AppComponent]
})
export class AppModule { }
