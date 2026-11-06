"""Render exact survey routing as three SVGs plus one optional PDF. Requires ReportLab."""
import argparse
import json
import math
from pathlib import Path
from xml.etree import ElementTree as ET

from reportlab.graphics import renderPDF, renderSVG
from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
W, H = 1100, 900
INK = '#203e37'
MUTED = '#506b60'
LINE = '#c8d9cf'
TEAL = '#196956'
GOLD = '#f8efdb'
GREEN = '#e8f3ed'
GREY = '#f1f4f0'
BLUE = '#eaf1f8'


def wrap(text, width, size, font='Helvetica'):
    result = []
    for paragraph in text.split('\n'):
        current = ''
        for word in paragraph.split():
            candidate = f'{current} {word}'.strip()
            if stringWidth(candidate, font, size) <= width:
                current = candidate
            else:
                if current:
                    result.append(current)
                if stringWidth(word, font, size) > width:
                    raise ValueError(f'Unbreakable text exceeds box width: {word}')
                current = word
        result.append(current)
    return result


def text(d, x, top, value, size=12, color=INK, font='Helvetica', width=None, leading=None):
    lines = wrap(value, width or W, size, font)
    leading = leading or size * 1.35
    for i, line in enumerate(lines):
        d.add(String(x, H - top - size - i * leading, line, fontName=font, fontSize=size, fillColor=HexColor(color)))
    return len(lines) * leading


def box(d, x, top, width, height, title, body='', tag='', fill=GREEN):
    d.add(Rect(x, H - top - height, width, height, rx=10, ry=10, fillColor=HexColor(fill), strokeColor=HexColor(LINE), strokeWidth=1))
    cursor = top + 13
    cursor += text(d, x + 15, cursor, title, 15, font='Helvetica-Bold', width=width - 30)
    if body:
        cursor += 5
        cursor += text(d, x + 15, cursor, body, 11.7, width=width - 30)
    if tag:
        cursor += 6
        cursor += text(d, x + 15, cursor, tag, 9.5, color=MUTED, width=width - 30)
    if cursor > top + height - 7:
        raise ValueError(f'Box overflows: {title}: {cursor:.1f} > {top + height - 7:.1f}')


def arrow(d, points, label='', label_at=None, dashed=False):
    converted = [(x, H - y) for x, y in points]
    for a, b in zip(converted, converted[1:]):
        d.add(Line(*a, *b, strokeColor=HexColor(MUTED), strokeWidth=1.6, strokeDashArray=[4, 3] if dashed else None))
    a, b = converted[-2:]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    dx, dy = dx / length, dy / length
    base = (b[0] - 7 * dx, b[1] - 7 * dy)
    d.add(Polygon([*b, base[0] - 3.5 * dy, base[1] + 3.5 * dx, base[0] + 3.5 * dy, base[1] - 3.5 * dx], fillColor=HexColor(MUTED), strokeColor=None))
    if label:
        x, top = label_at or points[len(points) // 2]
        width = stringWidth(label, 'Helvetica-Bold', 11) + 10
        d.add(Rect(x - width / 2, H - top - 15, width, 20, rx=4, fillColor=white, strokeColor=None))
        text(d, x - width / 2 + 5, top, label, 11, color=TEAL, font='Helvetica-Bold')


def base(number, title, subtitle):
    d = Drawing(W, H)
    d.add(Rect(0, 0, W, H, fillColor=white, strokeColor=None))
    d.add(Rect(35, H - 46, 6, 28, fillColor=HexColor(TEAL), strokeColor=None))
    text(d, 55, 20, f'{number}. {title}', 26, font='Helvetica-Bold', width=1000)
    text(d, 35, 65, subtitle, 13, color=MUTED, width=1030)
    d.add(Line(35, 32, 1065, 32, strokeColor=HexColor(LINE), strokeWidth=1))
    text(d, 35, 878, 'PULSE citizen survey | A0.9 instrument | 6 November 2026 | Routing logic is unchanged by the compact presentation.', 9, color=MUTED, width=1030)
    return d


def mobility():
    d = base(1, 'Mobility background and journey', 'After consent, adult confirmation and site choice, transport and real-journey constructs use separate gates. Non-car users remain included.')
    box(d, 35, 112, 1030, 88, 'Background: current travel and driving roles',
        'Usual modes and the main mode describe everyday travel. Current driving is asked only if it is not already reported. Paid-work driving asks about work powertrains separately.',
        'A-MOB-01 / A-MOB-PRIMARY; R-DRIVE-01; A-PRO-DRIVE-01 / A-PRO-PT-01')
    box(d, 35, 265, 480, 112, 'Can the future transport offers be compared?',
        'The scenario must not be rejected AND at least two offers must be evaluable. Declining to give the trip purpose does not block offer evaluation.',
        'B-TRIP-CONTEXT != 97; at least two codes 1-3 in B-MODE-EVAL', GOLD)
    box(d, 585, 265, 480, 112, 'Is there a recurring real journey?',
        'One journey in the past four weeks is selected as the reference. Current mode and a realistic alternative are established for that journey.',
        'A-JRN-01 = 1-4; A-JRN-02; C-ALT-01', GOLD)
    arrow(d, [(550, 200), (550, 230), (275, 230), (275, 265)])
    arrow(d, [(550, 230), (825, 230), (825, 265)])
    box(d, 35, 445, 225, 104, 'Show transport DCE', 'One practice and four scored choices.', 'T09-P; T09-01 to T09-04', BLUE)
    box(d, 290, 445, 225, 104, 'Skip transport DCE', 'Continue to the real-journey and service questions.', fill=GREY)
    box(d, 585, 445, 225, 104, 'Ask journey constructs', 'Use the selected real journey and confirmed mode referents.', fill=BLUE)
    box(d, 840, 445, 225, 104, 'Skip journey constructs', 'Continue to charging circumstances and services.', fill=GREY)
    arrow(d, [(275, 377), (275, 410), (147, 410), (147, 445)], 'Yes', (180, 393))
    arrow(d, [(275, 410), (402, 410), (402, 445)], 'No', (370, 393), True)
    arrow(d, [(825, 377), (825, 410), (697, 410), (697, 445)], 'Yes', (733, 393))
    arrow(d, [(825, 410), (952, 410), (952, 445)], 'No', (923, 393), True)
    box(d, 35, 615, 480, 126, 'Availability is specific to the hypothetical trip',
        'Actual weekly modes do not automatically remove future offers. Choosing only one evaluable offer, no evaluable offer, or rejecting the trip scenario skips these choice cards.',
        'Transport DCE is before COM-B; both use their own reference context.', fill=GREY)
    arrow(d, [(147, 549), (147, 580), (275, 580), (275, 615)])
    arrow(d, [(402, 549), (402, 580), (275, 580)], dashed=True)
    box(d, 585, 585, 480, 170, 'Separate the current mode from the alternative',
        'A confirmed alternative shows capability, opportunity and reflective motivation. A known current mode shows habit, even without a feasible alternative. Intention is shown when an alternative is valid; conditional intentions need all necessary changes to be named.',
        'C-ALT-01 = 1-5; or 6 + C-ALT-USED; or 97 + C-ALT-02. C-COND-01 controls conditional intentions.', BLUE)
    arrow(d, [(697, 549), (697, 585)])
    box(d, 35, 800, 1030, 58, 'Everyone continuing proceeds to household charging and service evaluation (Figure 2).', fill=GREEN)
    arrow(d, [(275, 741), (275, 800)])
    arrow(d, [(825, 755), (825, 800)])
    arrow(d, [(1065, 491), (1085, 491), (1085, 779), (1000, 779), (1000, 800)], dashed=True)
    return d


def charging():
    d = base(2, 'Powertrain, charging and household role', 'Powertrain gates actual charging experience. A household or realistic future role supports service evaluation.')
    box(d, 35, 112, 1030, 100, 'Establish household vehicle access and powertrains',
        'Regular or shared/limited access asks which powertrains are available. Multiple types may be selected. Someone without current vehicle access can still report a realistic future household role.',
        'A-VEH-ACCESS-01 = 1 or 2; A-HH-PT-01; A-FUT-ROLE = 1')
    box(d, 35, 265, 480, 112, 'Actual plug-in charging gate',
        'Household vehicle access AND a battery-electric vehicle or plug-in hybrid are required to ask the current charging role.',
        'A-HH-PT-01 contains code 1 (BEV) or 2 (PHEV)', GOLD)
    box(d, 585, 265, 480, 112, 'Private eligibility is assessed for each service',
        '(Household vehicle access OR realistic future household role) AND the respondent can evaluate that service.',
        'F-EVAL-W = 1 for WPT; F-EVAL-V = 1 for V2G', GOLD)
    arrow(d, [(550, 212), (550, 230), (275, 230), (275, 265)])
    arrow(d, [(550, 230), (825, 230), (825, 265)])
    box(d, 35, 455, 280, 126, 'Knows the charging arrangements?',
        'Usually charges/arranges charging, or knows where someone else charges it.', 'A-CHG-ROLE = 1 or 2', GOLD)
    box(d, 345, 455, 170, 126, 'Skip actual details', 'Keep the later service and public-view routes.', fill=GREY)
    arrow(d, [(275, 377), (275, 415), (175, 415), (175, 455)], 'Yes', (205, 397))
    arrow(d, [(275, 415), (430, 415), (430, 455)], 'No', (392, 397), True)
    arrow(d, [(315, 520), (345, 520)], 'No', (330, 488), True)
    box(d, 35, 650, 480, 123, 'Ask current charging details',
        'Ask locations. With one location, derive the main location; with several, ask which is used most. Home/out-of-home details follow the selected locations.',
        'A-CHG-LOC; A-CHG-MAIN; A-CHG-OUT; A-CHG-SCHED; A-CHG-PACE-01', BLUE)
    arrow(d, [(175, 581), (175, 650)], 'Yes', (197, 609))
    box(d, 585, 455, 225, 126, 'At least one service eligible', 'Assign one private WPT or V2G module; continue to Figure 3.', fill=BLUE)
    box(d, 840, 455, 225, 126, 'Neither service eligible', 'Assign one public reference concept; continue to Figure 3.', fill=GREY)
    arrow(d, [(825, 377), (825, 415), (697, 415), (697, 455)], 'Yes', (735, 397))
    arrow(d, [(825, 415), (952, 415), (952, 455)], 'No', (920, 397), True)
    box(d, 585, 650, 480, 123, 'Non-car users and non-drivers can participate',
        'A household or future role can support private evaluation. Paid-work driving or its powertrain alone does not establish household access. Otherwise the public route remains available.', fill=GREY)
    box(d, 35, 805, 1030, 52, 'Everyone sees neutral WPT and V2G descriptions before F-EVAL-W and F-EVAL-V.', fill=GREEN)
    return d


def services():
    d = base(3, 'Default technology assignment and follow-up', 'The ordinary survey shows one private technology DCE. The optional driver-comparison route is shown separately in Figure 4.')
    box(d, 35, 112, 1030, 78, 'After both service-evaluation answers, calculate private eligibility',
        'The decision uses household/future role and the two F-EVAL answers. Partner technology links are recorded overrides, rather than random assignment.')
    cases = [(35, 'WPT only eligible', 'Assign WPT with probability 1.'), (300, 'Both eligible', 'Randomly assign WPT or V2G, each with probability 0.5.'),
             (565, 'V2G only eligible', 'Assign V2G with probability 1.'), (830, 'Neither eligible', 'Use the public route with a WPT or V2G reference concept.')]
    for x, title, body in cases:
        box(d, x, 265, 235, 112, title, body, fill=GOLD)
    for target in [152, 417, 682, 947]:
        arrow(d, [(550, 190), (550, 225), (target, 225), (target, 265)])
    box(d, 35, 485, 320, 185, 'Private WPT route',
        'Twelve WPT acceptance indicators, trust and service diagnostics. If a two-hour stop can be evaluated: one practice plus six WPT choices. Otherwise skip only the WPT choices.',
        'G-WPT-CONTEXT-01 = 1; W09-P + W09-01 to W09-06', BLUE)
    box(d, 390, 485, 320, 185, 'Private V2G route',
        'Twenty-one V2G acceptance indicators, trust and service diagnostics. After the hypothetical terms, if contracts can be evaluated: one practice plus six V2G choices. Otherwise skip only these choices.',
        'G-V2G-CONTEXT-01 = 1; V09-P + V09-01 to V09-06', BLUE)
    box(d, 745, 485, 320, 185, 'Public/non-user route',
        'Assign a WPT or V2G reference concept, each with probability 0.5 by default. Ask public support and local views; private TAM and technology choices are omitted.',
        'Transport choices may already have been shown independently.', GREY)
    arrow(d, [(152, 377), (152, 432), (195, 432), (195, 485)])
    arrow(d, [(417, 377), (417, 413), (195, 413), (195, 485)], '0.5', (310, 394))
    arrow(d, [(417, 413), (550, 413), (550, 485)], '0.5', (490, 394))
    arrow(d, [(682, 377), (682, 450), (550, 450), (550, 485)])
    arrow(d, [(947, 377), (947, 447), (905, 447), (905, 485)])
    for x in [195, 550, 905]:
        arrow(d, [(x, 670), (x, 707), (550, 707), (550, 745)])
    box(d, 35, 745, 1030, 105, 'Shared follow-up and optional modules',
        'If information is enabled: a separate 1:1-probability explanation/core-only allocation, followed by its outcomes before benefit ratings. Benefits, local impacts and household demographics follow. Ranking, values, prosumer and extra conditions are shown only when enabled.',
        'Default cap: 4 transport + 6 assigned technology scored choices; 2 additional practices. All optional modules are off by default.')
    return d


def driver_review():
    d = base(4, 'Optional driver comparison of both DCEs', 'This partner-review option adds a second service comparison. The ordinary single-technology route remains the default.')
    box(d, 35, 112, 1030, 84, 'Partner link: ?dce=both-drivers',
        'The review flag is retained in the response and analysis metadata. Eligibility and each scenario context still apply. Transport choices keep their own evaluability gate.')
    box(d, 340, 265, 420, 112, 'Current driver AND both services privately eligible?',
        'Driving is reported in usual modes or R-DRIVE-01. Both services also need a household/future role and F-EVAL = Yes.', fill=GOLD)
    arrow(d, [(550, 196), (550, 265)])
    box(d, 35, 450, 300, 108, 'Keep the ordinary eligible route',
        'A non-driver can still compare an evaluable future household service, or give a public/non-user view.', fill=GREY)
    box(d, 390, 450, 675, 108, 'Primary service first; only its household acceptance module',
        'The ordinary assignment selects the primary service. With dual eligibility, each service has a 0.5 probability of being first, unless a recorded partner override sets the order.', fill=BLUE)
    arrow(d, [(550, 377), (550, 413), (185, 413), (185, 450)], 'No', (310, 394), True)
    arrow(d, [(550, 413), (725, 413), (725, 450)], 'Yes', (643, 394))
    box(d, 35, 630, 300, 112, 'Non-car respondents stay included',
        'Transport when evaluable; a technology service through a household/future role when evaluable; public views otherwise.', fill=GREY)
    box(d, 390, 630, 320, 112, 'Primary DCE context gate',
        'Yes: one practice plus six choices. No/uncertain: skip these choices, then continue to the other service.', fill=GOLD)
    box(d, 745, 630, 320, 112, 'Other service context gate',
        'A fresh concept, checks and scenario are provided. Yes: one practice plus six choices. Otherwise skip these choices.', fill=GOLD)
    arrow(d, [(185, 558), (185, 630)], dashed=True)
    arrow(d, [(725, 558), (725, 595), (550, 595), (550, 630)])
    arrow(d, [(710, 686), (745, 686)], 'Then', (728, 658))
    box(d, 35, 795, 1030, 62, 'Return to the primary service for reflections and benefits',
        'Maximum review burden: 16 scored choices plus 3 practices. The ordinary cap remains 10 scored choices plus 2 practices.', fill=GREEN)
    arrow(d, [(185, 742), (185, 770), (550, 770), (550, 795)], dashed=True)
    arrow(d, [(905, 742), (905, 770), (550, 770), (550, 795)])
    return d


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf', type=Path)
    args = parser.parse_args()
    source = json.loads((ROOT / 'public/v2/survey.json').read_text())
    known = {q['id'] for q in source['questions']}
    for id in ['A-MOB-01', 'R-DRIVE-01', 'A-PRO-PT-01', 'A-HH-PT-01', 'A-FUT-ROLE', 'B-MODE-EVAL', 'A-JRN-01', 'C-COND-01', 'A-CHG-ROLE', 'F-EVAL-W', 'F-EVAL-V', 'G-WPT-CONTEXT-01', 'G-V2G-CONTEXT-01']:
        assert id in known, id
    figures = [('routing-mobility', mobility()), ('routing-charging', charging()), ('routing-services', services()), ('routing-driver-review', driver_review())]
    target = ROOT / 'public/v2/assets/routing'
    target.mkdir(parents=True, exist_ok=True)
    for name, drawing in figures:
        filename = target / f'{name}.svg'
        renderSVG.drawToFile(drawing, str(filename))
        root = ET.fromstring(filename.read_text())
        title = ET.Element('{http://www.w3.org/2000/svg}title')
        title.text = name.replace('-', ' ').title()
        root.insert(0, title)
        desc = ET.Element('{http://www.w3.org/2000/svg}desc')
        desc.text = 'Routing as implemented in the PULSE A0.9 instrument. The companion routing guide provides equivalent decision rules and question IDs.'
        root.insert(1, desc)
        filename.write_text(ET.tostring(root, encoding='unicode'))
    if args.pdf:
        args.pdf.parent.mkdir(parents=True, exist_ok=True)
        pdf = canvas.Canvas(str(args.pdf), pagesize=(W, H))
        pdf.setTitle('PULSE survey routing - mobility, charging and service assignment')
        pdf.setAuthor('PULSE survey development')
        for _, drawing in figures:
            renderPDF.draw(drawing, pdf, 0, 0)
            pdf.showPage()
        pdf.save()
    print(json.dumps({'svg_files': [str(target / f'{name}.svg') for name, _ in figures], 'pdf': str(args.pdf) if args.pdf else None}))


if __name__ == '__main__':
    main()
