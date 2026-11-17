#!/usr/bin/env python3
"""用 OpenCASCADE 驗證 STEP：實體數、B-rep 有效性、體積為正、XCAF（顏色/名稱）可讀、外框尺寸。

安裝（約 1 分鐘）：python3 -m venv occ && occ/bin/pip install cadquery-ocp
用法：occ/bin/python validate_step.py a.stp [b.stp ...]
有無效實體、體積 ≤ 0、沒有實體或 XCAF 讀取失敗時 exit code = 1。
"""
import sys
from OCP.STEPControl import STEPControl_Reader
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.TopoDS import TopoDS

bad_any = False
for f in sys.argv[1:]:
    txt = open(f, encoding='latin-1').read()
    r = STEPControl_Reader()
    assert r.ReadFile(f) == IFSelect_RetDone, f
    r.TransferRoots()
    shape = r.OneShape()
    doc = TDocStd_Document(TCollection_ExtendedString("XmlOcaf"))
    cr = STEPCAFControl_Reader(); cr.SetColorMode(True); cr.SetNameMode(True)
    cr.ReadFile(f)
    okx = cr.Transfer(doc)
    n = bad = neg = 0
    vol = 0.0
    ex = TopExp_Explorer(shape, TopAbs_SOLID)
    while ex.More():
        s = TopoDS.Solid(ex.Current()); n += 1
        if not BRepCheck_Analyzer(s).IsValid():
            bad += 1
        g = GProp_GProps(); BRepGProp.VolumeProperties_s(s, g); v = g.Mass(); vol += v
        if v <= 1e-9:
            neg += 1
        ex.Next()
    bb = Bnd_Box(); BRepBndLib.Add_s(shape, bb); a = bb.CornerMin(); b = bb.CornerMax()
    print(f"{f}: solids={n} invalid={bad} nonpositive_volume={neg} "
          f"part_defs={txt.count('ADVANCED_BREP_SHAPE_REPRESENTATION(')} instances={txt.count('NEXT_ASSEMBLY_USAGE_OCCURRENCE(')} "
          f"colors={txt.count('STYLED_ITEM(')} xcaf={'OK' if okx else 'FAIL'} "
          f"bbox={b.X()-a.X():.0f}x{b.Y()-a.Y():.0f}x{b.Z()-a.Z():.0f}mm(Z-up) volume={vol/1e6:.2f}L")
    if bad or neg or n == 0 or not okx:
        bad_any = True
sys.exit(1 if bad_any else 0)
