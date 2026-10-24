// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
// Reads the text in images with macOS's Vision: ocr <image>…, each image's lines top to bottom, the images in turn.
// tools/rheims/build.py compiles it into its cache folder and gives it a column of a page, a strip at a time.
import AppKit
import Vision

for path in CommandLine.arguments.dropFirst() {
    guard let image = NSImage(contentsOfFile: path),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-GB"]
    request.usesLanguageCorrection = false  // it would modernise the 1582 wording
    try? VNImageRequestHandler(cgImage: cg).perform([request])
    // Vision may return one printed line in pieces: a piece joins the line it overlaps most of the way up and down,
    // and each line's pieces are read left to right.
    var lines: [[VNRecognizedTextObservation]] = []
    for piece in (request.results ?? []).sorted(by: { $0.boundingBox.midY > $1.boundingBox.midY }) {
        let box = piece.boundingBox
        if let i = lines.firstIndex(where: { line in
            line.contains { other in
                let overlap = min(box.maxY, other.boundingBox.maxY) - max(box.minY, other.boundingBox.minY)
                return overlap > 0.5 * min(box.height, other.boundingBox.height)
            }
        }) {
            lines[i].append(piece)
        } else {
            lines.append([piece])
        }
    }
    for line in lines {
        let text = line.sorted { $0.boundingBox.minX < $1.boundingBox.minX }.compactMap { $0.topCandidates(1).first?.string }
        print(text.joined(separator: " "))
    }
}
