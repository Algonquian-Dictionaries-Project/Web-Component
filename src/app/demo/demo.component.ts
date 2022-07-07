import { Component, Input, OnInit } from "@angular/core";

@Component({
  selector: "app-demo",
  templateUrl: "./demo.component.html",
  styleUrls: ["./demo.component.sass"],
})
export class DemoComponent implements OnInit {
  @Input() b64Inputs: string[];
  constructor() {}

  ngOnInit(): void {}

  download() {
    var element = document.createElement("a");
    let blob = new Blob(
      [
        `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0">
      <title>Test ReadAlong</title>
      <link rel="stylesheet" href="${this.b64Inputs[3][1]}">
      <script src="${this.b64Inputs[3][0]}"></script>
    </head>
    <body>
        <read-along text="${this.b64Inputs[1]}" alignment="${this.b64Inputs[2]}" audio="${this.b64Inputs[0]}" use-assets-folder="false">
        </read-along>
    </body>
    </html>`,
      ],
      { type: "text/html;charset=utf-8" }
    );
    element.href = window.URL.createObjectURL(blob);
    element.download = "readalong.html";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
}
