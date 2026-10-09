#pragma once
// Optional MAX7219 uses three spare GPIOs; HT16K33 keeps the fixed IMU I2C bus.
bool matrixSpi=false;int matrixDin=-1,matrixClk=-1,matrixCs=-1;
bool matrixUsesPin(int pin){return matrixSpi&&pin>=0&&(pin==matrixDin||pin==matrixClk||pin==matrixCs);}
bool matrixPinsValid(int din,int clk,int cs){int pins[3]={din,clk,cs};if(din==clk||din==cs||clk==cs)return false;for(int pin:pins)if(!auxPinAllowed(pin)||pin==servoPin||pin==gpsRxPin||pin==gpsTxPin||auxOutputActive(pin))return false;return true;}
void matrixSpiSend(uint8_t reg,uint8_t value){digitalWrite(matrixCs,LOW);uint16_t word=((uint16_t)reg<<8)|value;for(int bit=15;bit>=0;bit--){digitalWrite(matrixClk,LOW);digitalWrite(matrixDin,(word>>bit)&1);digitalWrite(matrixClk,HIGH);}digitalWrite(matrixClk,LOW);digitalWrite(matrixCs,HIGH);}
void matrixSpiBegin(){if(!matrixSpi)return;pinMode(matrixDin,OUTPUT);pinMode(matrixClk,OUTPUT);pinMode(matrixCs,OUTPUT);digitalWrite(matrixCs,HIGH);digitalWrite(matrixClk,LOW);matrixSpiSend(0x0F,0);matrixSpiSend(0x09,0);matrixSpiSend(0x0B,7);matrixSpiSend(0x0A,8);matrixSpiSend(0x0C,1);for(int i=0;i<8;i++)matrixSpiSend(i+1,matrixRows[i]);}
void matrixSpiRelease(){if(matrixSpi){matrixSpiSend(0x0C,0);pinMode(matrixDin,INPUT);pinMode(matrixClk,INPUT);pinMode(matrixCs,INPUT);}matrixSpi=false;matrixDin=matrixClk=matrixCs=-1;}
