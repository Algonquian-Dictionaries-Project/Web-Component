import { ToastrService } from "ngx-toastr";
import { forkJoin, from, Subject, zip } from "rxjs";
import { map, switchMap, take } from "rxjs/operators";

import { Component, EventEmitter, OnInit, Output } from "@angular/core";
import { FormBuilder, FormControl, Validators } from "@angular/forms";

import { AudioService } from "../audio.service";
import { FileService } from "../file.service";
import { RasService } from "../ras.service";
import { SoundswallowerService } from "../soundswallower.service";

@Component({
  selector: "app-upload",
  templateUrl: "./upload.component.html",
  styleUrls: ["./upload.component.sass"],
})
export class UploadComponent implements OnInit {
  langs$ = this.rasService.getLangs$().pipe(
    map((langs: object) =>
      Object.entries(langs).map((x: Array<Array<string>>) => {
        return { id: x[0], name: x[1] };
      })
    )
  );
  $loading = new Subject<boolean>();
  langControl = new FormControl<string | null>(null, Validators.required);
  textControl = new FormControl<any>(null, Validators.required);
  audioControl = new FormControl<File | null>(null, Validators.required);
  // buffer audio as soon as uploaded
  audioBuffer$ = new Subject<AudioBuffer>();
  @Output() stepChange = new EventEmitter<any[]>();
  public uploadFormGroup = this._formBuilder.group({
    lang: this.langControl,
    text: this.textControl,
    audio: this.audioControl,
  });
  rawText = "";
  processedXML = "";
  engDemoText =
    "the three little kittens they lost their mittens and they began to cry oh mother dear we sadly fear hat we have lost our mittens what lost your mittens you naughty kittens then you shall have no pie meow meow meow then you shall have no pie";
  constructor(
    private _formBuilder: FormBuilder,
    private toastr: ToastrService,
    private rasService: RasService,
    private fileService: FileService,
    private audioService: AudioService,
    private ssjsService: SoundswallowerService
  ) {}

  ngOnInit(): void {
    this.ssjsService.initialize$().then(
      (_) => {
        this.ssjsService.alignerReady$.next(true);
      },
      (err) => console.log(err)
    );
  }

  nextStep() {
    if (this.uploadFormGroup.valid) {
      // Loading
      this.$loading.next(true);
      // Determine text type
      let text_type = "text";
      if (this.textControl.value.name.endsWith("xml")) {
        text_type = "xml";
      }
      let body: any = {
        text_languages: [this.langControl.value, "und"],
        encoding: "utf8",
      };
      // Combine audio and text observables
      // Read file
      console.log(this.audioControl.value);
      let currentAudio: any = this.audioControl.value;
      forkJoin([
        this.audioService.loadAudioBufferFromFile$(currentAudio),
        this.fileService.readFile$(this.textControl.value).pipe(
          // Only take first response
          take(1),
          // Query RAS service
          switchMap((xml: any) => {
            console.log("query api");
            body[text_type] = xml;
            return this.rasService.assembleReadalong$(body);
          }),
          // Create Grammar
          switchMap((ras: any) => {
            console.log("create grammar");
            this.rawText = ras["text_ids"];
            this.processedXML = ras["processed_xml"];
            return from(
              this.ssjsService.createGrammar$(ras["jsgf"], ras["lexicon"])
            );
          })

          // Emit change with response to parent
        ),
      ]).subscribe((response: any) => {
        console.log(response[0]);
        let hypseg = this.ssjsService.align$(response[0], this.rawText);
        this.$loading.next(false);
        this.stepChange.emit([
          "aligned",
          this.audioControl.value,
          this.processedXML,
          hypseg,
        ]);
      });
    } else {
      this.toastr.error(
        "Please upload a text and audio file and select the language.",
        "Form not complete!"
      );
    }
  }

  onFileSelected(type: any, event: any) {
    const file: File = event.target.files[0];
    if (file.size > 10000000) {
      this.toastr.error("File too large", "Sorry!");
    } else {
      if (type === "audio") {
        this.audioControl.setValue(file);
        this.toastr.success("File " + file.name + " uploaded", "Great!");
      } else if (type === "text") {
        this.textControl.setValue(file);
        this.toastr.success("File " + file.name + " uploaded", "Great!");
      }
    }
  }
}
