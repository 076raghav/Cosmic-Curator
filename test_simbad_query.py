from astroquery.simbad import Simbad

result = Simbad.query_object("Vega")
print(result)
